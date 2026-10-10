const crypto = require('node:crypto');
const { normalizeRef, referenceKey } = require('./referenceKey');
const { enqueueEvent } = require('./outbox');

function obligationId(consumerKey, dependencyKey, agentId) {
  return crypto.createHash('sha256').update([consumerKey, dependencyKey, agentId || ''].join('\0')).digest('hex');
}

async function assertAcyclic(db, consumerKey, dependencyKey) {
  const visited = new Set();
  const queue = [dependencyKey];
  while (queue.length) {
    const key = queue.shift();
    if (key === consumerKey) throw new Error('Scientific dependency cycle');
    if (visited.has(key)) continue;
    visited.add(key);
    if (visited.size > 10000) throw new Error('Scientific dependency cycle check budget exceeded');
    const rows = await db.all(`SELECT dependency_key FROM scientific_dependency_edges
      WHERE consumer_key = ?`, [key]);
    queue.push(...rows.map((row) => row.dependency_key));
  }
}

async function registerDependencies(db, input) {
  if (!Array.isArray(input?.dependencies)) throw new Error('dependencies must be an array');
  const consumer = normalizeRef(input.consumerRef);
  const consumerKey = referenceKey(consumer);
  const agentId = input.consumerAgentId ? String(input.consumerAgentId).trim() : null;
  const ids = [];
  for (const rawDependency of input.dependencies) {
    const dependency = normalizeRef(rawDependency);
    const dependencyKey = referenceKey(dependency);
    if (consumerKey === dependencyKey) throw new Error('Scientific reference cannot depend on itself');
    await assertAcyclic(db, consumerKey, dependencyKey);
    await db.run(`INSERT OR IGNORE INTO scientific_dependency_edges
      (consumer_key, dependency_key, consumer_ref_json, dependency_ref_json)
      VALUES (?, ?, ?, ?)`,
    [consumerKey, dependencyKey, JSON.stringify(consumer), JSON.stringify(dependency)]);
    const id = obligationId(consumerKey, dependencyKey, agentId);
    await db.run(`INSERT OR IGNORE INTO scientific_obligations
      (obligation_id, consumer_key, dependency_key, consumer_agent_id) VALUES (?, ?, ?, ?)`,
    [id, consumerKey, dependencyKey, agentId]);
    ids.push(id);
  }
  return ids;
}

async function satisfyObligations(db, input) {
  const receiptId = String(input?.verificationReceiptId || '').trim();
  if (!receiptId) throw new Error('Verification receipt id required');
  const result = await db.run(`UPDATE scientific_obligations
    SET state = 'satisfied', satisfaction_receipt_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE dependency_key = ? AND state = 'open'`,
  [receiptId, referenceKey(input.ref)]);
  return result.changes;
}

async function getDependentAgents(db, ref) {
  const rows = await db.all(`SELECT DISTINCT o.consumer_agent_id
    FROM scientific_dependency_edges e JOIN scientific_obligations o
      ON o.consumer_key = e.consumer_key AND o.dependency_key = e.dependency_key
    WHERE e.dependency_key = ? AND e.state = 'active' AND o.consumer_agent_id IS NOT NULL`,
  [referenceKey(ref)]);
  return rows.map((row) => row.consumer_agent_id);
}

async function consumersFor(db, input) {
  const rows = await db.all(`SELECT DISTINCT o.consumer_agent_id
    FROM scientific_dependency_edges e
    JOIN scientific_obligations o
      ON o.consumer_key = e.consumer_key AND o.dependency_key = e.dependency_key
    WHERE e.dependency_key = ? AND e.state = 'active' AND o.state = 'open'
      AND o.consumer_agent_id IS NOT NULL`, [referenceKey(input.ref)]);
  return rows.map((row) => row.consumer_agent_id);
}

async function staleDependent(db, context) {
  const { edge, originKey, reason, retractionReceiptId, retractionReceiptDigest,
    sourceRef, senderAgentId } = context;
  const agents = await db.all(`SELECT DISTINCT consumer_agent_id FROM scientific_obligations
    WHERE consumer_key = ? AND dependency_key = ? AND consumer_agent_id IS NOT NULL`,
  [edge.consumer_key, edge.dependency_key]);
  await db.run(`UPDATE scientific_dependency_edges SET state = 'stale'
    WHERE consumer_key = ? AND dependency_key = ?`, [edge.consumer_key, edge.dependency_key]);
  await db.run(`UPDATE scientific_obligations SET state = 'stale', updated_at = CURRENT_TIMESTAMP
    WHERE consumer_key = ? AND dependency_key = ?`, [edge.consumer_key, edge.dependency_key]);
  await db.run(`INSERT OR IGNORE INTO scientific_suspensions
    (consumer_key, origin_key, retraction_receipt_id, retraction_receipt_digest, reason)
    VALUES (?, ?, ?, ?, ?)`,
  [edge.consumer_key, originKey, retractionReceiptId, retractionReceiptDigest, reason]);
  const consumerRef = JSON.parse(edge.consumer_ref_json);
  const events = await enqueueEvent(db, {
    eventType: 'invalidate', ref: consumerRef,
    recipients: agents.map((row) => row.consumer_agent_id),
    idempotencyKey: `${originKey}:${retractionReceiptId}`,
    payload: { sourceRef, retractionReceiptId, retractionReceiptDigest, reason, senderAgentId },
  });
  return { consumerRef, events };
}

async function invalidateDependents(db, input) {
  const sourceRef = normalizeRef(input?.ref);
  const receiptId = String(input.retractionReceiptId || '').trim();
  if (!receiptId) throw new Error('Retraction receipt id required');
  const receiptDigest = String(input.retractionReceiptDigest || '').trim();
  if (!/^sha256:[a-f0-9]{64}$/i.test(receiptDigest)) throw new Error('Retraction receipt digest required');
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('Retraction reason required');
  const originKey = referenceKey(sourceRef);
  const visited = new Set([originKey]);
  const queue = [originKey];
  const events = [];
  const affectedRefs = [];
  while (queue.length) {
    const dependencyKey = queue.shift();
    const edges = await db.all(`SELECT * FROM scientific_dependency_edges WHERE dependency_key = ?`,
      [dependencyKey]);
    for (const edge of edges) {
      const outcome = await staleDependent(db, { edge, originKey, reason,
        retractionReceiptId: receiptId, retractionReceiptDigest: receiptDigest,
        sourceRef, senderAgentId: input.senderAgentId });
      events.push(...outcome.events);
      if (visited.has(edge.consumer_key)) continue;
      visited.add(edge.consumer_key);
      affectedRefs.push({ ref: outcome.consumerRef,
        causalRef: JSON.parse(edge.dependency_ref_json) });
      queue.push(edge.consumer_key);
    }
  }
  return { affectedCount: affectedRefs.length, affectedRefs, eventIds: [...new Set(events)] };
}

module.exports = { registerDependencies, satisfyObligations, getDependentAgents,
  consumersFor, invalidateDependents };
