const crypto = require('node:crypto');
const { withTransaction } = require('../../db');
const { normalizeRef, referenceKey } = require('./referenceKey');

const PRIORITY = Object.freeze({ publish: 10, invalidate: 90, retract: 100 });

function eventIdentity(input, subjectKey, recipient) {
  const discriminator = input.idempotencyKey || input.payload?.retractionReceiptId || '';
  const material = [input.eventType, subjectKey, recipient || '', discriminator].join('\0');
  return crypto.createHash('sha256').update(material).digest('hex');
}

function recipientsOf(input) {
  if (input.recipients === undefined) return [input.recipientAgentId || null];
  if (!Array.isArray(input.recipients)) throw new Error('recipients must be an array');
  return [...new Set(input.recipients.map((value) => String(value).trim()))];
}

async function enqueueEvent(db, input) {
  if (!Object.hasOwn(PRIORITY, input?.eventType)) throw new Error('Invalid scientific event type');
  const ref = normalizeRef(input.ref);
  const subjectKey = referenceKey(ref);
  const payloadJson = JSON.stringify(input.payload || {});
  if (payloadJson.length > 65536) throw new Error('Scientific event payload too large');
  const ids = [];
  for (const recipient of recipientsOf(input)) {
    const eventId = eventIdentity(input, subjectKey, recipient);
    await db.run(`INSERT OR IGNORE INTO scientific_outbox
      (event_id, event_key, event_type, subject_key, subject_ref_json,
       recipient_agent_id, payload_json, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, eventId, input.eventType, subjectKey, JSON.stringify(ref),
      recipient, payloadJson, PRIORITY[input.eventType]]);
    ids.push(eventId);
  }
  return ids;
}

function normalizeClaim(input) {
  const workerId = String(input?.workerId || '').trim();
  if (!workerId || workerId.length > 256) throw new Error('workerId required');
  const limit = Math.min(100, Math.max(1, Number(input.limit) || 10));
  const leaseMs = Math.min(300000, Math.max(1000, Number(input.leaseMs) || 30000));
  const nowMs = Number(input.nowMs) || Date.now();
  return { workerId, limit, leaseMs, nowMs };
}

async function claimEvents(db, input) {
  const claim = normalizeClaim(input);
  return withTransaction(db, async (tx) => {
    const rows = await tx.all(`SELECT * FROM scientific_outbox
      WHERE state = 'pending' OR (state = 'claimed' AND claimed_until_ms <= ?)
      ORDER BY priority DESC, created_at ASC, event_id ASC LIMIT ?`,
    [claim.nowMs, claim.limit]);
    const claimed = [];
    for (const row of rows) {
      const token = crypto.randomUUID();
      const until = claim.nowMs + claim.leaseMs;
      const update = await tx.run(`UPDATE scientific_outbox
        SET state = 'claimed', claimed_by = ?, claim_token = ?,
            claimed_until_ms = ?, attempts = attempts + 1
        WHERE event_id = ? AND
          (state = 'pending' OR (state = 'claimed' AND claimed_until_ms <= ?))`,
      [claim.workerId, token, until, row.event_id, claim.nowMs]);
      if (update.changes) claimed.push({ ...row, claimed_by: claim.workerId,
        claim_token: token, claimed_until_ms: until, attempts: row.attempts + 1 });
    }
    return claimed;
  });
}

async function ackEvent(db, input) {
  const result = await db.run(`UPDATE scientific_outbox
    SET state = 'acked', claimed_by = NULL, claim_token = NULL,
        claimed_until_ms = NULL, acked_at = CURRENT_TIMESTAMP
    WHERE event_id = ? AND state = 'claimed' AND claimed_by = ? AND claim_token = ?`,
  [input.eventId, input.workerId, input.claimToken]);
  return result.changes === 1;
}

async function releaseEvent(db, input) {
  const result = await db.run(`UPDATE scientific_outbox
    SET state = 'pending', claimed_by = NULL, claim_token = NULL,
        claimed_until_ms = NULL
    WHERE event_id = ? AND state = 'claimed' AND claimed_by = ? AND claim_token = ?`,
  [input.eventId, input.workerId, input.claimToken]);
  return result.changes === 1;
}

module.exports = { enqueueEvent, claimEvents, ackEvent, releaseEvent };
