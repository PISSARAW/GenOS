'use strict';

const { digest } = require('./biologicalIntegrity');
const outcome = require('./terminalOutcomeEvidence');

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS verified_terminal_failures (
  run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, mission_id TEXT NOT NULL,
  organization_id TEXT, project_id TEXT, event_json TEXT NOT NULL, event_hash TEXT NOT NULL,
  evidence_json TEXT NOT NULL, evidence_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
); CREATE INDEX IF NOT EXISTS idx_verified_terminal_failures_scope
  ON verified_terminal_failures(agent_id, organization_id, project_id, created_at);`;

async function ensure(db) {
  await db.exec(TABLE_SQL);
}

async function record(db, input) {
  const { run, biologicalReceipt, event } = input;
  const binding = await require('./biologicalWorkerStore').binding(db, run?.id);
  const evidence = event?.payload?.negativeOutcomeEvidence;
  const refused = refusalReason({ run, biologicalReceipt, event, binding, evidence });
  if (refused) return { status: 'refused', reason: refused };
  await ensure(db);
  return persist(db, { run, biologicalReceipt, event, binding, evidence });
}

function refusalReason(input) {
  if (!outcome.FAILURE_EVENTS.has(input.event?.eventType)) return 'negative_terminal_event_required';
  if (!input.run || !['failed', 'blocked', 'cancelled'].includes(input.run.status)
      || input.event.payload?.executionRunId !== input.run.id) return 'terminal_run_binding_required';
  if (!receiptBindsRun({ receipt: input.biologicalReceipt, run: input.run, binding: input.binding, event: input.event })) {
    return 'biological_terminal_receipt_required';
  }
  const expected = { actionId: input.run.id, agentId: input.run.agent_id,
    organizationId: input.binding.tenant.organizationId, projectId: input.binding.tenant.projectId };
  if (input.event.payload?.negativeOutcomeEvidenceStatus?.status !== 'verified'
      || !outcome.validateNegativeOutcome({ event: input.event, evidence: input.evidence, binding: expected })) {
    return 'signed_negative_outcome_evidence_required';
  }
  return null;
}

function receiptBindsRun(input) {
  const { receipt, run, binding, event } = input;
  return Boolean(binding && binding.runId === run.id && binding.workerId === run.agent_id
    && receipt?.runId === run.id && receipt.workerId === run.agent_id
    && receipt.missionId === binding.missionId && receipt.result?.status === run.status
    && receipt.result?.verified === false && receipt.evidence?.observations?.includes(digest(event)));
}

async function persist(db, input) {
  const eventJson = JSON.stringify(input.event);
  const evidenceJson = JSON.stringify(input.evidence);
  const eventHash = digest(input.event);
  const evidenceHash = digest(input.evidence);
  const tenant = input.binding.tenant;
  const result = await db.run(`INSERT OR IGNORE INTO verified_terminal_failures
    (run_id, agent_id, mission_id, organization_id, project_id, event_json, event_hash, evidence_json, evidence_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.run.id, input.run.agent_id, input.binding.missionId,
  tenant.organizationId, tenant.projectId, eventJson, eventHash, evidenceJson, evidenceHash);
  const saved = await db.get('SELECT * FROM verified_terminal_failures WHERE run_id=?', input.run.id);
  if (!sameRecord({ saved, input, eventHash, evidenceHash })) {
    throw Object.assign(new Error('A terminal failure run already has different signed evidence.'), {
      code: 'TERMINAL_FAILURE_EVIDENCE_CONFLICT'
    });
  }
  return { status: 'recorded', runId: input.run.id, receiptId: input.evidence.receiptId,
    replayed: result.changes === 0 };
}

function sameRecord(context) {
  const { saved, input, eventHash, evidenceHash } = context;
  return Boolean(saved && saved.agent_id === input.run.agent_id && saved.mission_id === input.binding.missionId
    && saved.organization_id === input.binding.tenant.organizationId && saved.project_id === input.binding.tenant.projectId
    && saved.event_hash === eventHash && saved.evidence_hash === evidenceHash);
}

async function recentMemories(db, input) {
  await ensure(db);
  const rows = await db.all(`SELECT * FROM verified_terminal_failures WHERE agent_id=?
    AND organization_id IS ? AND project_id IS ? ORDER BY created_at DESC LIMIT ?`, input.agentId,
  input.organizationId || null, input.projectId || null, Math.max(1, Math.min(10, Number(input.limit) || 5)));
  const memories = [];
  for (const row of rows) {
    const memory = await verifiedMemory(db, row);
    if (memory) memories.push(memory);
  }
  return memories;
}

async function verifiedMemory(db, row) {
  try {
    const event = parseHashBound(row.event_json, row.event_hash);
    const evidence = parseHashBound(row.evidence_json, row.evidence_hash);
    const current = await currentRunEvidence(db, row);
    if (!current || !receiptBindsRun({ ...current, event })) return null;
    const binding = { actionId: row.run_id, agentId: row.agent_id,
      organizationId: row.organization_id, projectId: row.project_id };
    if (!outcome.validateNegativeOutcome({ event, evidence, binding })) return null;
    return memoryEntry(row, event, evidence);
  } catch (_) {
    return null;
  }
}

async function currentRunEvidence(db, row) {
  const store = require('./biologicalWorkerStore');
  const [binding, receipt, run] = await Promise.all([
    store.binding(db, row.run_id), store.receipt(db, row.run_id),
    db.get('SELECT id, agent_id, status FROM strategy_execution_runs WHERE id=?', row.run_id)
  ]);
  if (!run || !['failed', 'blocked', 'cancelled'].includes(run.status)
      || run.id !== row.run_id || run.agent_id !== row.agent_id || !binding
      || binding.missionId !== row.mission_id || binding.tenant.organizationId !== row.organization_id
      || binding.tenant.projectId !== row.project_id || receipt?.result?.status !== run.status) return null;
  return { run, binding, receipt };
}

function parseHashBound(json, hash) {
  const value = JSON.parse(json);
  if (digest(value) !== hash) throw new Error('Terminal failure memory integrity mismatch.');
  return value;
}

function memoryEntry(row, event, evidence) {
  return { id: row.run_id, title: `Issue négative vérifiée · ${event.eventType}`,
    content: `Le vérificateur indépendant a attesté une issue négative pour le run ${row.run_id}. Référence: ${evidence.receiptId}.`,
    status: 'FAILURE', category: 'Failure', organizationId: row.organization_id,
    projectId: row.project_id, createdAt: row.created_at, evidenceRefs: [evidence.receiptId],
    provenance: { runId: row.run_id, missionId: row.mission_id, receiptId: evidence.receiptId },
    provenanceIntegrity: row.evidence_hash };
}

module.exports = { ensure, record, recentMemories };
