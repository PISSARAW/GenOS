'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../db');
const requests = require('./garageRequests');
const policies = require('./garagePolicies');

async function event(db, row, record) {
  await db.run(`INSERT INTO garage_events(request_id, orchestrator_id, event_type, lease_id, payload_json)
    VALUES (?, ?, ?, ?, ?)`, row.request_id, row.orchestrator_id, record.type, row.lease_id || null, JSON.stringify(record.payload || {}));
}

async function enqueuePersistent(db, input = {}) {
  const request = await requests.prepare(db, input);
  const fingerprint = requests.hash(request);
  return withTransaction(db, async () => {
    const previous = await db.get('SELECT * FROM garage_queue WHERE request_id = ?', request.requestId);
    if (previous) {
      if (previous.request_hash !== fingerprint) throw requests.error('GARAGE_IDEMPOTENCY_CONFLICT', 'Request id already has different content.');
      return previous;
    }
    const domain = await require('./garageDomainService').ensureDomain(db, request.orchestratorId);
    const pending = await db.get(`SELECT COUNT(*) AS count FROM garage_queue
      WHERE orchestrator_id = ? AND status IN ('queued','claimed','running')`, request.orchestratorId);
    if (pending.count >= domain.queue_capacity) throw requests.error('GARAGE_QUEUE_FULL', 'Orchestrator queue limit reached.');
    await db.run(`INSERT INTO garage_queue(request_id, orchestrator_id, worker_id, organization_id,
      project_id, mode, priority, request_json, request_hash, phase, policy_json, deadline_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, request.requestId, request.orchestratorId,
    request.workerId, request.organizationId, request.projectId, request.mode, request.priority,
    JSON.stringify(request), fingerprint, policies.resolve(request.mode).dormant ? 'dormant' : 'ready',
    JSON.stringify(policies.resolve(request.mode)), request.deadlineAt || null);
    const row = await db.get('SELECT * FROM garage_queue WHERE request_id = ?', request.requestId);
    await event(db, row, { type: 'enqueued', payload: { mode: row.mode } });
    return row;
  });
}

async function candidates(db, input) {
  const rows = await db.all(`SELECT q.*, a.name AS worker_name, a.role AS worker_role, a.about AS worker_about
    FROM garage_queue q JOIN agents a ON a.id = q.worker_id
    WHERE q.status = 'queued' AND q.phase = 'ready' AND a.status = 'idle'
      AND (? IS NULL OR q.orchestrator_id = ?)
      AND (q.not_before IS NULL OR julianday(q.not_before) <= julianday(?))
      AND (q.deadline_at IS NULL OR julianday(q.deadline_at) > julianday(?))
      AND NOT EXISTS (SELECT 1 FROM garage_queue busy WHERE busy.worker_id = q.worker_id
        AND (busy.status IN ('claimed','running') OR busy.phase IN ('freezing','freeze_failed','frozen','thawing','cancelling')))`, input.orchestratorId || null,
  input.orchestratorId || null, input.now, input.now);
  const history = await db.all(`SELECT orchestrator_id, COUNT(*) AS count FROM garage_events
    WHERE event_type = 'running' AND created_at >= datetime('now', '-1 hour') GROUP BY orchestrator_id`);
  const context = { now: Date.parse(input.now), served: Object.fromEntries(history.map((row) => [row.orchestrator_id, row.count])),
    observations: await require('./garageRoutingService').observations(db) };
  return rows.sort((a, b) => policies.score(b, context) - policies.score(a, context) || a.request_id.localeCompare(b.request_id));
}

async function claimNextPersistent(db, input = {}) {
  const now = input.now || new Date().toISOString();
  return withTransaction(db, async () => {
    for (const row of await candidates(db, { ...input, now })) {
      if (!await policies.eligible(db, row)) continue;
      const ttl = Math.min(300000, Math.max(1000, Number(input.ttlMs) || 60000));
      const leaseId = crypto.randomUUID();
      await db.run(`UPDATE garage_queue SET status = 'claimed', lease_id = ?, lease_expires_at = ?,
        owner_id = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`,
      leaseId, new Date(Date.parse(now) + ttl).toISOString(), input.ownerId || String(process.pid), row.request_id);
      const claimed = await db.get('SELECT * FROM garage_queue WHERE request_id = ?', row.request_id);
      await event(db, claimed, { type: 'claimed' });
      return { ...claimed, leaseId, leaseExpiresAt: Date.parse(claimed.lease_expires_at) };
    }
    return null;
  });
}

function assertCompletion(input) {
  if (input.status !== 'completed') return;
  // Only the runtime evidence reader is permitted to supply this receipt.
  if (input.evidence?.verified !== true || !input.evidence.runId || !input.evidence.artifactHash) {
    throw requests.error('GARAGE_EVIDENCE_REQUIRED', 'Runtime evidence receipt is required for completion.');
  }
}

async function verifyCompletion(db, row, input) {
  if (input.status !== 'completed') return;
  const receipt = await require('./garageRuntimeEvidence').receipt(db, row);
  if (!receipt || receipt.artifactHash !== input.evidence.artifactHash || receipt.runId !== input.evidence.runId) {
    throw requests.error('GARAGE_EVIDENCE_REQUIRED', 'Completion receipt does not match persisted runtime evidence.');
  }
}

async function updatePersistent(db, input = {}) {
  if (!['running', 'completed', 'cancelled', 'failed', 'expired', 'queued'].includes(input.status)) throw requests.error('GARAGE_STATE_INVALID', 'Invalid transition.');
  if (!input.leaseId) throw requests.error('GARAGE_FENCE_REQUIRED', 'Lease fencing token is required.');
  assertCompletion(input);
  return transition(db, input);
}

async function transition(db, input) {
  return withTransaction(db, async () => {
    const row = await db.get(`SELECT * FROM garage_queue WHERE request_id = ? AND lease_id = ?
      AND status IN ('claimed','running')`, input.requestId, input.leaseId);
    if (!canTransition(row, input)) return false;
    await verifyCompletion(db, row, input);
    await persistTransition(db, row, input);
    return true;
  });
}

function canTransition(row, input) {
  if (!row || row.phase !== 'ready') return false;
  if (['running','completed'].includes(input.status) && !(Date.parse(row.lease_expires_at) > Date.now())) return false;
  return input.status !== 'running' || row.status === 'claimed';
}

async function persistTransition(db, row, input) {
    await db.run(`UPDATE garage_queue SET status = ?, phase = ?, result_json = COALESCE(?, result_json), error_text = ?,
      started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, CURRENT_TIMESTAMP) ELSE started_at END,
      updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND lease_id = ?`, input.status,
    input.phase || 'ready', input.result ? JSON.stringify(input.result) : null, input.error || null,
    input.status, row.request_id, input.leaseId);
    await event(db, row, { type: input.status, payload: { code: input.error || null, phase: input.phase || 'ready' } });
}

async function renewPersistent(db, input) {
  const expires = new Date(Date.now() + Math.min(300000, Math.max(1000, Number(input.ttlMs) || 60000))).toISOString();
  const result = await db.run(`UPDATE garage_queue SET lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE request_id = ? AND lease_id = ? AND status IN ('claimed','running')
      AND julianday(lease_expires_at) > julianday('now')`, expires, input.requestId, input.leaseId);
  return result.changes === 1;
}

async function expirePersistent(db, input = {}) {
  // A running process is not dead merely because its lease expired. Runtime reconciliation owns it.
  return withTransaction(db, async () => {
    const rows = await db.all(`SELECT * FROM garage_queue WHERE status = 'claimed' AND phase = 'ready'
      AND julianday(lease_expires_at) <= julianday(?)`, input.now || new Date().toISOString());
    for (const row of rows) {
      await updatePersistent(db, { requestId: row.request_id, leaseId: row.lease_id,
        status: 'queued', error: 'claim_expired_before_launch' });
    }
    return rows.length;
  });
}

module.exports = { enqueuePersistent, claimNextPersistent, updatePersistent, expirePersistent, renewPersistent, event };
