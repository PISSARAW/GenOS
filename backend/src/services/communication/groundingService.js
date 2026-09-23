'use strict';

const { getDatabase } = require('../../db');

const GROUNDING_LEVELS = new Set([
  'none', 'transport_ack', 'semantic_ack', 'action_ack', 'verified_ack', 'human_confirmation'
]);

const LEVEL_RANK = Object.freeze({
  none: 0, transport_ack: 1, semantic_ack: 2, action_ack: 3, verified_ack: 4, human_confirmation: 5
});

const GROUNDING_REQUIREMENTS = Object.freeze({
  none: { level: 'none', deadlineMs: 0 },
  transport_ack: { level: 'transport_ack', deadlineMs: 5000 },
  semantic_ack: { level: 'semantic_ack', deadlineMs: 30000 },
  action_ack: { level: 'action_ack', deadlineMs: 300000 },
  verified_ack: { level: 'verified_ack', deadlineMs: 900000 },
  human_confirmation: { level: 'human_confirmation', deadlineMs: 86400000 }
});

const GROUNDING_COLUMNS = [
  ['grounding_level', "TEXT NOT NULL DEFAULT 'none'"],
  ['semantic_hash', 'TEXT'],
  ['evidence_hash', 'TEXT'],
  ['contract_version', 'TEXT'],
  ['grounded_at', 'DATETIME'],
  ['verified_at', 'DATETIME']
];

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureGroundingColumns(inputDb) {
  const db = await resolveDb(inputDb);
  const columns = await db.all('PRAGMA table_info(signal_deliveries)');
  const names = new Set((columns || []).map((col) => col.name));
  if (names.size === 0) return db;
  for (const [name, type] of GROUNDING_COLUMNS) {
    if (!names.has(name)) {
      await db.exec(`ALTER TABLE signal_deliveries ADD COLUMN ${name} ${type}`);
    }
  }
  return db;
}

function rankOf(level) {
  const known = LEVEL_RANK[level];
  if (known === undefined) return -1;
  return known;
}

function levelForRisk(risk, requiresAction) {
  if (risk === 'critical') return 'human_confirmation';
  if (risk === 'high') return 'verified_ack';
  if (risk === 'medium') return requiresAction ? 'action_ack' : 'semantic_ack';
  return requiresAction ? 'semantic_ack' : 'transport_ack';
}

function requireGrounding(input) {
  const entry = GROUNDING_REQUIREMENTS[levelForRisk(input.risk, input.requiresAction)];
  if (!entry) return { level: 'semantic_ack', deadlineMs: 30000 };
  return { level: entry.level, deadlineMs: entry.deadlineMs };
}

function deserializeDelivery(row) {
  return {
    signalId: row.signal_id,
    subscriberAgentId: row.subscriber_agent_id,
    status: row.status,
    groundingLevel: row.grounding_level || 'none',
    semanticHash: row.semantic_hash || null,
    evidenceHash: row.evidence_hash || null,
    contractVersion: row.contract_version || null,
    deliveredAt: row.delivered_at,
    seenAt: row.seen_at,
    ackedAt: row.acked_at,
    groundedAt: row.grounded_at || null,
    verifiedAt: row.verified_at || null
  };
}

async function loadDelivery(db, signalId, subscriberAgentId) {
  const row = await db.get(
    'SELECT * FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?',
    [signalId, subscriberAgentId]
  );
  if (!row) throw new Error(`No delivery for signal '${signalId}' to '${subscriberAgentId}'.`);
  return row;
}

async function setLevel(query) {
  await query.db.run(
    `UPDATE signal_deliveries
     SET status = ?, grounding_level = ?,
       semantic_hash = COALESCE(semantic_hash, ?), evidence_hash = COALESCE(evidence_hash, ?),
       grounded_at = COALESCE(grounded_at, CURRENT_TIMESTAMP), verified_at = ?
     WHERE signal_id = ? AND subscriber_agent_id = ?`,
    [query.status, query.level, query.semanticHash || null, query.evidenceHash || null,
      query.verifiedAt || null, query.signalId, query.subscriberAgentId]
  );
}

async function recordSignalGrounding(input) {
  const db = await ensureGroundingColumns(input.db);
  await db.run(
    `INSERT OR IGNORE INTO signal_deliveries (signal_id, subscriber_agent_id, status, delivered_at)
     VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)`,
    [input.signalId, input.subscriberAgentId]
  );
  await db.run(
    `UPDATE signal_deliveries
     SET semantic_hash = COALESCE(semantic_hash, ?), contract_version = COALESCE(contract_version, ?)
     WHERE signal_id = ? AND subscriber_agent_id = ?`,
    [input.semanticHash || null, input.contractVersion || null, input.signalId, input.subscriberAgentId]
  );
  return getGroundingStatus({ db, signalId: input.signalId, subscriberAgentId: input.subscriberAgentId });
}

function alreadyAt(row, target) {
  return rankOf(row.grounding_level) >= rankOf(target);
}

async function currentStatus(db, input) {
  return getGroundingStatus({ db, signalId: input.signalId, subscriberAgentId: input.subscriberAgentId });
}

async function ackTransport(input) {
  const db = await ensureGroundingColumns(input.db);
  const row = await loadDelivery(db, input.signalId, input.subscriberAgentId);
  if (alreadyAt(row, 'transport_ack')) return currentStatus(db, input);
  await setLevel({
    db, signalId: row.signal_id, subscriberAgentId: row.subscriber_agent_id,
    status: 'delivered', level: 'transport_ack'
  });
  return currentStatus(db, input);
}

function boundSemanticHash(row, inputHash) {
  if (row.semantic_hash && inputHash && row.semantic_hash !== inputHash) {
    throw new Error(`SEMANTIC_MISMATCH: delivery holds '${row.semantic_hash}', offered '${inputHash}'. Fail closed, no guessing.`);
  }
  if (row.semantic_hash) return row.semantic_hash;
  if (inputHash) return inputHash;
  return null;
}

async function ackSemantic(input) {
  const db = await ensureGroundingColumns(input.db);
  const row = await loadDelivery(db, input.signalId, input.subscriberAgentId);
  if (alreadyAt(row, 'semantic_ack')) return currentStatus(db, input);
  const bound = boundSemanticHash(row, input.semanticHash);
  await setLevel({
    db, signalId: row.signal_id, subscriberAgentId: row.subscriber_agent_id,
    status: 'seen', level: 'semantic_ack', semanticHash: bound
  });
  return currentStatus(db, input);
}

async function ackAction(input) {
  const db = await ensureGroundingColumns(input.db);
  const row = await loadDelivery(db, input.signalId, input.subscriberAgentId);
  if (alreadyAt(row, 'action_ack')) return currentStatus(db, input);
  if (rankOf(row.grounding_level) < rankOf('semantic_ack')) {
    throw new Error(`GROUNDING_LADDER: action_ack requires semantic_ack first (holds '${row.grounding_level || 'none'}').`);
  }
  await setLevel({
    db, signalId: row.signal_id, subscriberAgentId: row.subscriber_agent_id,
    status: 'acked', level: 'action_ack'
  });
  return currentStatus(db, input);
}

async function ackVerified(input) {
  const db = await ensureGroundingColumns(input.db);
  const row = await loadDelivery(db, input.signalId, input.subscriberAgentId);
  if (rankOf(row.grounding_level) < rankOf('action_ack')) {
    throw new Error(`GROUNDING_LADDER: verified_ack requires action_ack first (holds '${row.grounding_level || 'none'}').`);
  }
  if (row.evidence_hash && input.evidenceHash && row.evidence_hash !== input.evidenceHash) {
    throw new Error('EVIDENCE_MISMATCH: verification evidence does not match the bound digest.');
  }
  await setLevel({
    db, signalId: row.signal_id, subscriberAgentId: row.subscriber_agent_id,
    status: 'acked', level: 'verified_ack', evidenceHash: input.evidenceHash,
    verifiedAt: new Date().toISOString()
  });
  return currentStatus(db, input);
}

async function ackHuman(input) {
  const db = await ensureGroundingColumns(input.db);
  if (!input.approverId) throw new Error('human_confirmation requires an approverId.');
  const row = await loadDelivery(db, input.signalId, input.subscriberAgentId);
  if (alreadyAt(row, 'human_confirmation')) return currentStatus(db, input);
  await setLevel({
    db, signalId: row.signal_id, subscriberAgentId: row.subscriber_agent_id,
    status: 'acked', level: 'human_confirmation', verifiedAt: new Date().toISOString()
  });
  return currentStatus(db, input);
}

async function getGroundingStatus(input) {
  const db = await ensureGroundingColumns(input.db);
  if (input.subscriberAgentId) {
    const row = await db.get(
      'SELECT * FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?',
      [input.signalId, input.subscriberAgentId]
    );
    if (!row) return null;
    return deserializeDelivery(row);
  }
  const rows = await db.all(
    'SELECT * FROM signal_deliveries WHERE signal_id = ? ORDER BY subscriber_agent_id ASC',
    [input.signalId]
  );
  return rows.map(deserializeDelivery);
}

async function checkQuorum(input) {
  const db = await ensureGroundingColumns(input.db);
  const rows = await db.all(
    'SELECT grounding_level AS level FROM signal_deliveries WHERE signal_id = ?',
    [input.signalId]
  );
  const required = rankOf(input.level);
  let acked = 0;
  for (const row of rows) {
    if (rankOf(row.level) >= required) acked += 1;
  }
  const total = rows.length;
  const satisfied = total > 0 && acked >= input.quorum;
  return { satisfied, acked, total, level: input.level, quorum: input.quorum };
}

module.exports = {
  GROUNDING_LEVELS,
  ensureGroundingColumns,
  recordSignalGrounding,
  ackTransport,
  ackSemantic,
  ackAction,
  ackVerified,
  ackHuman,
  getGroundingStatus,
  requireGrounding,
  checkQuorum
};
