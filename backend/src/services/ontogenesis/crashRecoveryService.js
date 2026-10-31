'use strict';

const crypto = require('crypto');
const journal = require('./operationJournal');
const outbox = require('./outboxStore');
const { canonicalJson } = require('./durableJson');

const MAX_PREPARED_RECOVERY_ATTEMPTS = 5;
const PREPARED_RECOVERY_BASE_DELAY_MS = 1000;
const PREPARED_RECOVERY_MAX_DELAY_MS = 30000;

async function recordReceipt(db, input) {
  await db.run(`INSERT OR IGNORE INTO ontogenesis_recovery_receipts
    (id, project_id, operation_id, recovery_attempt, owner, before_state,
      disposition, observed_state, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [`onto_recovery_${crypto.randomUUID()}`, input.projectId, input.operationId, input.attempt,
    input.owner, input.beforeState, input.disposition, input.observedState,
    canonicalJson(input.evidence)]);
}

async function advance(db, input) {
  const row = await journal.getOperation(db, input.operationId);
  if (row.state === input.state) return row;
  return journal.transitionOperation(db, input);
}

async function recoverPrepared(db, input) {
  if (input.attempt > MAX_PREPARED_RECOVERY_ATTEMPTS) {
    return escalate(db, input, 'reprises-preparation-epuisees');
  }
  await recordReceipt(db, { ...input, disposition: 'retry_safe', observedState: 'no_effect', evidence: {} });
  return 'retry_safe';
}

function preparedRecoveryDelayMs(attempt) {
  return Math.min(PREPARED_RECOVERY_BASE_DELAY_MS * (2 ** (attempt - 1)), PREPARED_RECOVERY_MAX_DELAY_MS);
}

async function preparedRecoveryDue(db, row) {
  if (!row.recovery_attempt) return true;
  const elapsed = await db.get(`SELECT (julianday('now') - julianday(?)) * 86400000 AS elapsed_ms`,
    [row.updated_at]);
  return elapsed?.elapsed_ms == null || elapsed.elapsed_ms >= preparedRecoveryDelayMs(row.recovery_attempt);
}

async function recoverCommitted(db, input) {
  await advance(db, { operationId: input.operationId, state: 'completed', result: { recovered: true } });
  await recordReceipt(db, { ...input, disposition: 'completed', observedState: 'durable_effect', evidence: {} });
  return 'completed';
}

async function executionFor(db, operationId) {
  return db.get('SELECT * FROM ontogenesis_execution WHERE id = ?', [operationId]);
}

async function recoverDeadDispatch(db, input, execution) {
  await db.run(`UPDATE ontogenesis_execution SET phase = 'finished', pid = NULL,
    result_json = ?, updated_at = datetime('now') WHERE id = ? AND phase IN ('prepared','running')`,
  [JSON.stringify({ success: false, error: 'runtime-interrompu-repris' }), execution.id]);
  let row = await journal.getOperation(db, input.operationId);
  if (row.state === 'started') row = await advance(db, { operationId: row.id, state: 'effect_applied',
    result: { executionPersisted: true } });
  await advance(db, { operationId: row.id, state: 'compensated', result: { runtimeAlive: false } });
  await advance(db, { operationId: row.id, state: 'completed', result: { recovered: true, runtimeAlive: false } });
  await recordReceipt(db, { ...input, disposition: 'compensated', observedState: 'runtime_dead',
    evidence: { executionId: execution.id } });
  return 'compensated';
}

async function recoverDispatch(db, input) {
  const execution = await executionFor(db, input.operationId);
  if (!execution && input.beforeState === 'started') {
    await advance(db, { operationId: input.operationId, state: 'prepared', result: { recovered: true } });
    await recordReceipt(db, { ...input, disposition: 'reset_prepared', observedState: 'no_execution', evidence: {} });
    return 'reset_prepared';
  }
  if (!execution) return escalate(db, input, 'execution-absente-apres-effet');
  { const __genosStageResult1 = await require('./crashRecoveryServiceStages1.js').recoverDispatchStage1({ advance, db, execution, input, journal, recordReceipt }); if (__genosStageResult1) return __genosStageResult1.value; }
  const observed = await input.harness.observe(execution);
  if (observed.alive && observed.observable === false) {
    return escalate(db, input, 'observation-runtime-ambigue');
  }
  if (!observed.alive) return recoverDeadDispatch(db, input, execution);
  let row = await journal.getOperation(db, input.operationId);
  if (row.state === 'started') row = await advance(db, { operationId: row.id, state: 'effect_applied',
    result: { executionPersisted: true } });
  await advance(db, { operationId: row.id, state: 'completed', result: { runtimeAlive: true } });
  await recordReceipt(db, { ...input, disposition: 'adopted', observedState: 'runtime_alive',
    evidence: { executionId: execution.id, pid: execution.pid } });
  return 'adopted';
}

async function recoverIntegration(db, input) {
  const executionId = input.intent.executionId || input.operationId.replace(/^onto_integration_/, '');
  const integration = await db.get('SELECT * FROM ontogenesis_integrations WHERE id = ?', [executionId]);
  const execution = await executionFor(db, executionId);
  if (integration?.status === 'committed' && execution && execution.phase === 'integrated') {
    let row = await journal.getOperation(db, input.operationId);
    if (row.state === 'started') row = await advance(db, { operationId: row.id, state: 'effect_applied',
      result: { sha: integration.result_sha } });
    if (row.state === 'effect_applied') await advance(db, { operationId: row.id, state: 'completed',
      result: { sha: integration.result_sha } });
    await recordReceipt(db, { ...input, disposition: 'completed', observedState: 'integration_committed',
      evidence: { sha: integration.result_sha } });
    return 'completed';
  }
  await recordReceipt(db, { ...input, disposition: 'resume_pipeline', observedState: integration?.status || 'pending',
    evidence: { executionPhase: execution?.phase || null } });
  return 'resume_pipeline';
}

async function escalate(db, input, reason) {
  const row = await journal.getOperation(db, input.operationId);
  if (row.state !== 'escalated') await advance(db, { operationId: row.id, state: 'escalated', failure: { reason } });
  await outbox.enqueue(db, { projectId: input.projectId, operationId: input.operationId,
    channel: 'conversation', kind: 'recovery_escalation', dedupeKey: `recovery:${input.operationId}`,
    payload: { operationId: input.operationId, reason } });
  await db.run("UPDATE ontogenesis_projects SET state = 'WAITING_INPUT' WHERE id = ?", [input.projectId]);
  await recordReceipt(db, { ...input, disposition: 'escalated', observedState: 'ambiguous', evidence: { reason } });
  return 'escalated';
}

async function recoverOne(db, input) {
  if (input.beforeState === 'prepared') return recoverPrepared(db, input);
  if (['committed', 'compensated'].includes(input.beforeState)) return recoverCommitted(db, input);
  if (input.kind === 'dispatch' && input.harness) return recoverDispatch(db, input);
  if (input.kind === 'integrate') return recoverIntegration(db, input);
  return escalate(db, input, 'strategie-reprise-absente');
}

async function recoverIncompleteOperations(db, input) {
  const rows = await journal.listIncompleteOperations(db, input.projectId);
  const outcomes = [];
  for (const row of rows) {
    if (row.state === 'prepared' && !await preparedRecoveryDue(db, row)) continue;
    const claimed = await journal.claimForRecovery(db, { operationId: row.id, owner: input.owner, ttlMs: 120000 });
    if (!claimed) continue;
    const claimedRow = await journal.getOperation(db, row.id);
    try {
      const outcome = await recoverOne(db, { ...input, operationId: row.id, kind: row.kind,
        beforeState: row.state, attempt: claimedRow.recovery_attempt, intent: JSON.parse(row.intent_json) });
      outcomes.push({ operationId: row.id, outcome });
    } finally {
      await journal.releaseRecoveryClaim(db, { operationId: row.id, owner: input.owner });
    }
  }
  return outcomes;
}

module.exports = { recoverIncompleteOperations };
