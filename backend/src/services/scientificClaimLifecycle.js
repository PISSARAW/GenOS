'use strict';

const values = require('./trinityProvenanceValues');

const HTTP_STATUS = { SCIENTIFIC_CLAIM_SCOPE_MISMATCH: 404,
  SCIENTIFIC_CLAIM_STATE_CONFLICT: 409, SCIENTIFIC_CLAIM_EVENT_CONFLICT: 409,
  SCIENTIFIC_LIFECYCLE_INVALID: 400, SCIENTIFIC_CLAIM_TRANSITION_INVALID: 400,
  SCIENTIFIC_EVIDENCE_REFERENCE_UNKNOWN: 400 };

function invalid(code) { return Object.assign(new Error(code), { code, status: HTTP_STATUS[code] || 500 }); }

function text(value) {
  if (typeof value !== 'string' || !value.trim()) throw invalid('SCIENTIFIC_LIFECYCLE_INVALID');
  return value.trim();
}

function claimHash(claim) {
  return values.digest({ claimId: claim.claim_id, experimentId: claim.experiment_id,
    statement: claim.statement, scope: JSON.parse(claim.scope_json),
    assumptions: JSON.parse(claim.assumptions_json), createdBy: claim.created_by });
}

async function scopedClaim(db, input) {
  const claim = await db.get('SELECT * FROM scientific_claims WHERE claim_id = ? AND experiment_id = ?',
    text(input.claimId), text(input.experimentId));
  if (!claim) throw invalid('SCIENTIFIC_CLAIM_SCOPE_MISMATCH');
  return claim;
}

async function verifyRefs(db, input) {
  if (!Array.isArray(input.evidenceRefs)) throw invalid('SCIENTIFIC_LIFECYCLE_INVALID');
  for (const id of input.evidenceRefs) {
    const row = await db.get('SELECT * FROM scientific_evidence WHERE claim_id = ? AND evidence_id = ?', input.claimId, text(id));
    if (!row) throw invalid('SCIENTIFIC_EVIDENCE_REFERENCE_UNKNOWN');
    if (values.digest(JSON.parse(row.evidence_json)) !== row.content_hash) throw invalid('SCIENTIFIC_EVIDENCE_CORRUPT');
  }
}

function validateTransition(previous, next) {
  const allowed = { proposed: ['rejected', 'retracted'], rejected: ['retracted'], retracted: [] };
  if (!allowed[previous]?.includes(next)) throw invalid('SCIENTIFIC_CLAIM_TRANSITION_INVALID');
}

async function inspect(db, claim) {
  const hash = claimHash(claim);
  const rows = await db.all('SELECT * FROM scientific_claim_events WHERE claim_id = ? ORDER BY rowid', claim.claim_id);
  let headHash = hash;
  let status = 'proposed';
  const events = [];
  for (const row of rows) {
    const item = parseEvent(row);
    assertEvent(item, { row, claim, hash, headHash });
    validateTransition(status, item.status);
    await verifyRefs(db, item);
    events.push({ ...item, hash: row.event_hash });
    headHash = row.event_hash;
    status = item.status;
  }
  return { status, headHash, claimHash: hash, events, promotionEligible: false };
}

function parseEvent(row) {
  try {
    const item = JSON.parse(row.payload_json);
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid event object');
    return item;
  } catch (_) { throw invalid('SCIENTIFIC_CLAIM_HISTORY_CORRUPT'); }
}

function assertEvent(item, context) {
  const { row, claim, hash, headHash } = context;
  const correct = item.schema === 'genos.scientific.claim-event/v1'
    && item.claimId === claim.claim_id && item.experimentId === claim.experiment_id
    && item.claimHash === hash && item.previousHash === headHash
    && row.previous_hash === headHash && row.event_id === item.eventId
    && row.event_hash === values.digest(item);
  if (!correct) throw invalid('SCIENTIFIC_CLAIM_HISTORY_CORRUPT');
}

function eventPayload(input, lifecycle) {
  const item = { schema: 'genos.scientific.claim-event/v1',
    experimentId: text(input.experimentId), claimId: text(input.claimId),
    claimHash: lifecycle.claimHash, previousHash: text(input.expectedHeadHash),
    eventId: text(input.eventId), status: text(input.status), rationale: text(input.rationale),
    evidenceRefs: [...new Set(input.evidenceRefs || [])].sort(), createdBy: text(input.createdBy) };
  if (Buffer.byteLength(values.encode(item)) > 65536) throw invalid('SCIENTIFIC_LIFECYCLE_INVALID');
  return item;
}

async function record(db, input) {
  return require('../db').withTransaction(db, () => appendTransition(db, input));
}

async function appendTransition(db, input) {
  if (input.evidenceRefs !== undefined && !Array.isArray(input.evidenceRefs)) throw invalid('SCIENTIFIC_LIFECYCLE_INVALID');
  const claim = await scopedClaim(db, input);
  const lifecycle = await inspect(db, claim);
  const item = eventPayload(input, lifecycle);
  const prior = lifecycle.events.find(event => event.eventId === item.eventId);
  if (prior) return replay(prior, item);
  if (item.previousHash !== lifecycle.headHash) throw invalid('SCIENTIFIC_CLAIM_STATE_CONFLICT');
  validateTransition(lifecycle.status, item.status);
  await verifyRefs(db, item);
  const hash = values.digest(item);
  const saved = await db.run(`INSERT OR IGNORE INTO scientific_claim_events
    (event_id, claim_id, previous_hash, event_hash, payload_json)
    SELECT ?, ?, ?, ?, ? WHERE COALESCE((SELECT event_hash FROM scientific_claim_events
      WHERE claim_id = ? ORDER BY rowid DESC LIMIT 1), ?) = ?`,
  item.eventId, item.claimId, item.previousHash, hash, values.encode(item), item.claimId, lifecycle.claimHash, item.previousHash);
  if (saved.changes === 1) return { ...item, hash };
  const current = await inspect(db, claim);
  const duplicate = current.events.find(event => event.eventId === item.eventId);
  if (duplicate) return replay(duplicate, item);
  throw invalid('SCIENTIFIC_CLAIM_STATE_CONFLICT');
}

function replay(prior, item) {
  if (prior.hash !== values.digest(item)) throw invalid('SCIENTIFIC_CLAIM_EVENT_CONFLICT');
  return prior;
}

module.exports = { inspect, record, scopedClaim };
