const { retryDbOperation } = require('./signalValidationUtils');

const GROUNDING_LEVELS = Object.freeze({
  transport_ack: 1, semantic_ack: 2, action_ack: 3, verified_ack: 4, human_confirmation: 5
});

async function subscribeAgent(db, subscriberAgentId, topicFilter) {
  if (!db || !subscriberAgentId || !topicFilter) return false;
  const { topic, filter } = normalizeTopicFilter(topicFilter);
  try {
    await retryDbOperation(() => db.run(
      `INSERT OR REPLACE INTO signal_subscriptions (subscriber_agent_id, topic, filter)
       VALUES (?, ?, ?)`,
      [subscriberAgentId, topic, filter]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] subscribeAgent failed: ${e.message}`);
    return false;
  }
}

async function unsubscribeAgent(db, subscriberAgentId, topic) {
  if (!db || !subscriberAgentId || !topic) return false;
  try {
    await retryDbOperation(() => db.run(
      `DELETE FROM signal_subscriptions WHERE subscriber_agent_id = ? AND topic = ?`,
      [subscriberAgentId, topic]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] unsubscribeAgent failed: ${e.message}`);
    return false;
  }
}

async function recordPendingDelivery(db, signalId, subscriberAgentId) {
  if (!db || !signalId || !subscriberAgentId) return false;
  try {
    await retryDbOperation(() => db.run(
      `INSERT OR IGNORE INTO signal_deliveries (signal_id, subscriber_agent_id, status, delivered_at)
       VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [signalId, subscriberAgentId]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] recordPendingDelivery failed: ${e.message}`);
    return false;
  }
}

async function markDelivered(db, delivery) {
  if (!db || !delivery) return false;
  const { signalId, subscriberAgentId } = delivery;
  try {
    await retryDbOperation(() => db.run(
      `UPDATE signal_deliveries SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
       WHERE signal_id = ? AND subscriber_agent_id = ? AND status = 'pending'`,
      [signalId, subscriberAgentId]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] markDelivered failed: ${e.message}`);
    return false;
  }
}

async function ackDelivery(db, delivery) {
  if (!db || !delivery) return false;
  const { signalId, subscriberAgentId } = delivery;
  try {
    await retryDbOperation(() => db.run(
      `UPDATE signal_deliveries SET status = 'acked', acked_at = CURRENT_TIMESTAMP
       WHERE signal_id = ? AND subscriber_agent_id = ? AND status != 'acked'`,
      [signalId, subscriberAgentId]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] ackDelivery failed: ${e.message}`);
    return false;
  }
}

function validateGrounding(delivery) {
  const level = GROUNDING_LEVELS[delivery.groundingLevel];
  if (!level) throw new Error('Unsupported grounding level.');
  if (level > 2) throw new Error('Action and human grounding require a connected evidence verifier.');
  if (level >= 2 && !validHash(delivery.semanticHash)) throw new Error('Semantic grounding requires a SHA-256 semanticHash.');
  if (level >= 2 && !delivery.contractVersion) throw new Error('Grounding requires a contractVersion.');
  return level;
}

function validHash(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function statusesForGrounding(level) {
  if (level === 'transport_ack') return ['delivered', 'seen', 'acked'];
  if (level === 'semantic_ack') return ['seen', 'acked'];
  return ['acked'];
}

async function recordGrounding(db, delivery) {
  if (!db || !delivery?.signalId || !delivery?.subscriberAgentId) return { recorded: false, reason: 'invalid_delivery' };
  const rank = validateGrounding(delivery);
  const statuses = statusesForGrounding(delivery.groundingLevel);
  const placeholders = statuses.map(() => '?').join(', ');
  const result = await retryDbOperation(() => db.run(
    `UPDATE signal_deliveries SET grounding_level = ?, semantic_hash = ?, evidence_hash = ?,
       contract_version = ?, grounded_at = CURRENT_TIMESTAMP
     WHERE signal_id = ? AND subscriber_agent_id = ? AND status IN (${placeholders})
       AND CASE grounding_level WHEN 'none' THEN 0 WHEN 'transport_ack' THEN 1
         WHEN 'semantic_ack' THEN 2 WHEN 'action_ack' THEN 3 WHEN 'verified_ack' THEN 4
         WHEN 'human_confirmation' THEN 5 ELSE 0 END < ?`,
    [delivery.groundingLevel, delivery.semanticHash || null, delivery.evidenceHash || null,
      delivery.contractVersion || null, delivery.signalId, delivery.subscriberAgentId,
      ...statuses, rank]
  ));
  return { recorded: Boolean(result?.changes), reason: result?.changes ? null : 'delivery_state_or_grounding_level' };
}

async function getPendingDeliveries(db, subscriberAgentId) {
  if (!db || !subscriberAgentId) return [];
  try {
    return await retryDbOperation(() => db.all(
      `SELECT signal_id, subscriber_agent_id, status, delivered_at
       FROM signal_deliveries WHERE subscriber_agent_id = ? AND status = 'pending'
       ORDER BY delivered_at ASC`,
      [subscriberAgentId]
    ));
  } catch (e) {
    console.warn(`[SignalDelivery] getPendingDeliveries failed: ${e.message}`);
    return [];
  }
}

async function claimPendingDelivery(db, input) {
  const { signalId, subscriberAgentId, owner, now, leaseMs } = input;
  const result = await db.run(`
    INSERT INTO signal_delivery_claims
      (signal_id, subscriber_agent_id, claim_owner, lease_until_ms, next_attempt_at_ms, attempts)
    SELECT ?, ?, ?, ?, 0, 1
    WHERE EXISTS (SELECT 1 FROM signal_deliveries
      WHERE signal_id = ? AND subscriber_agent_id = ? AND status = 'pending')
    ON CONFLICT(signal_id, subscriber_agent_id) DO UPDATE SET
      claim_owner = excluded.claim_owner,
      lease_until_ms = excluded.lease_until_ms,
      attempts = signal_delivery_claims.attempts + 1,
      last_error = NULL
    WHERE signal_delivery_claims.lease_until_ms <= ?
      AND signal_delivery_claims.next_attempt_at_ms <= ?
      AND signal_delivery_claims.dead_lettered_at_ms IS NULL
      AND EXISTS (SELECT 1 FROM signal_deliveries
        WHERE signal_id = ? AND subscriber_agent_id = ? AND status = 'pending')
  `, [signalId, subscriberAgentId, owner, now + leaseMs, signalId, subscriberAgentId,
    now, now, signalId, subscriberAgentId]);
  return Boolean(result?.changes);
}

async function completeClaimedDelivery(db, input) {
  const { signalId, subscriberAgentId, owner, now = Date.now() } = input;
  const result = await db.run(`UPDATE signal_deliveries SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
    WHERE signal_id = ? AND subscriber_agent_id = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM signal_delivery_claims c WHERE c.signal_id = ?
        AND c.subscriber_agent_id = ? AND c.claim_owner = ? AND c.lease_until_ms > ?)`,
  [signalId, subscriberAgentId, signalId, subscriberAgentId, owner, now]);
  await db.run(`DELETE FROM signal_delivery_claims
    WHERE signal_id = ? AND subscriber_agent_id = ? AND claim_owner = ?`,
  [signalId, subscriberAgentId, owner]);
  return Boolean(result?.changes);
}

async function releaseDeliveryClaim(db, input) {
  const { signalId, subscriberAgentId, owner, now, error, terminal = false } = input;
  const claim = await db.get(`SELECT attempts FROM signal_delivery_claims
    WHERE signal_id = ? AND subscriber_agent_id = ? AND claim_owner = ? AND lease_until_ms > ?`,
  [signalId, subscriberAgentId, owner, now]);
  if (!claim) return false;
  const deadLetter = terminal || claim.attempts >= 8;
  const delay = Math.min(60_000, 500 * (2 ** Math.min(claim.attempts - 1, 7)));
  const result = await db.run(`UPDATE signal_delivery_claims SET claim_owner = '', lease_until_ms = 0,
      next_attempt_at_ms = ?, last_error = ?,
      dead_lettered_at_ms = CASE WHEN ? THEN ? ELSE NULL END
    WHERE signal_id = ? AND subscriber_agent_id = ? AND claim_owner = ? AND lease_until_ms > ?`,
  [deadLetter ? Number.MAX_SAFE_INTEGER : now + delay, String(error || '').slice(0, 500),
    deadLetter ? 1 : 0, now, signalId, subscriberAgentId, owner, now]);
  return Boolean(result?.changes);
}

async function listPendingSignalDeliveries(db, subscriberAgentIds, limit = 50) {
  if (!db || !Array.isArray(subscriberAgentIds) || !subscriberAgentIds.length) return [];
  const placeholders = subscriberAgentIds.map(() => '?').join(', ');
  return db.all(`SELECT d.signal_id, d.subscriber_agent_id, s.signal_type, s.signal_blob,
      s.content, s.topic, s.sender_agent_id, s.created_at
    FROM signal_deliveries d
    JOIN signal_blobs s ON s.signal_id = d.signal_id
    LEFT JOIN signal_delivery_claims c ON c.signal_id = d.signal_id
      AND c.subscriber_agent_id = d.subscriber_agent_id
    WHERE d.status = 'pending' AND d.subscriber_agent_id IN (${placeholders})
      AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
      AND (c.signal_id IS NULL OR (c.lease_until_ms <= ? AND c.next_attempt_at_ms <= ?
        AND c.dead_lettered_at_ms IS NULL))
    ORDER BY s.created_at ASC LIMIT ?`, [...subscriberAgentIds, Date.now(), Date.now(), limit]);
}

function normalizeTopicFilter(topicFilter) {
  if (typeof topicFilter === 'string') return { topic: topicFilter, filter: null };
  const { topic = '', filter = null } = topicFilter || {};
  return { topic, filter };
}

module.exports = {
  subscribeAgent,
  unsubscribeAgent,
  recordPendingDelivery,
  markDelivered,
  ackDelivery,
  recordGrounding,
  getPendingDeliveries,
  claimPendingDelivery,
  completeClaimedDelivery,
  releaseDeliveryClaim,
  listPendingSignalDeliveries,
};
