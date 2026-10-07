'use strict';
const { withTransaction } = require('../db');
const { digest, identity } = require('./biologicalIntegrity');
const store = require('./biologicalWorkerStore');
const evidence = require('./biologicalWorkerEvidence');
const events = require('./strategyExecutionEvents');
const TERMINAL_STATUSES = ['completed', 'failed', 'blocked', 'cancelled'];

async function finalize(db, runId) {
  const binding = await store.binding(db, runId);
  if (!binding) return null;
  const previous = await store.receipt(db, runId);
  if (previous) return previous;
  const run = await events.getRun(db, runId);
  if (!TERMINAL_STATUSES.includes(run?.status)) return null;
  const observations = await store.observations(db, runId);
  const snapshot = evidence.evidenceSnapshot(observations);
  const terminal = evidence.terminalObservation(observations);
  const verification = terminal && await require('./epistemic/nativeOracleGate').historical(db, {
    runId, agentId: binding.workerId, event: terminal.event });
  const guardrail = terminal ? require('./strategyPromotionGate').completionGuardrail(
    binding.genome.strategyContract, terminal.event.payload, { agentId: binding.workerId, gateContext: verification?.gateContext }) : 'Missing terminal observation';
  const oracleExecution = await require('./epistemic/nativeOracleCostReceipt').forRun(db, binding);
  const receipt = buildReceipt({ binding, run, observations, snapshot, guardrail, verification });
  if (oracleExecution) {
    receipt.oracleExecution = oracleExecution;
    receipt.budgetAssessment.satisfied &&= oracleExecution.budgetAssessment.satisfied;
  }
  return store.putReceipt(db, receipt);
}

function buildReceipt(input) {
  const { binding, run, observations, snapshot, guardrail, verification } = input;
  const receipt = { schema: 'genos.worker-biological-execution-receipt/v1', runtime: 'node-worker',
    receiptId: identity(['genos.worker-receipt/v1', run.id]), missionId: binding.missionId,
    runId: run.id, workerId: binding.workerId, cellId: binding.cellId, genomeId: binding.genomeId,
    genomeHash: binding.genomeHash, bindingHash: digest(binding),
    lineage: { parentWorkerId: binding.parentWorkerId }, costs: evidence.costs(observations, run),
    accounting: evidence.accounting(observations, run),
    result: { status: run.status, completed: run.status === 'completed',
      verified: run.status === 'completed' && successfulTerminal(snapshot) && !guardrail && evidence.hasResultEvidence(snapshot),
      gate: 'strategy_execution_gate', reason: run.guardrailReason || guardrail || null },
    evidence: snapshot, completedAt: run.completedAt || null };
  receipt.budgetAssessment = evidence.budgetAssessment(receipt, binding);
  if (verification) {
    receipt.semanticVerification = semanticVerification(verification);
    receipt.budgetAssessment.satisfied &&= receipt.semanticVerification.budgetAssessment.satisfied;
  }
  return receipt;
}

function semanticVerification(verification) {
  const attestation = verification.proof.attestation;
  const costs = attestation.value.costs;
  const limits = verification.proof.allocation.value.limits;
  return { schema: 'genos.native-oracle-receipt-reference/v1', eventId: attestation.eventId, hash: attestation.hash,
    acceptanceHash: verification.acceptance.hash, costs,
    budgetAssessment: { limits, satisfied: costs.processes <= limits.executions && costs.runtimeMs <= limits.latencyMs,
      localComputeUsdMeasured: costs.localComputeUsd !== null } };
}

async function record(db, request) {
  const agent = await db.get('SELECT execution_mode FROM agents WHERE id = ?', request.agentId);
  if (agent?.execution_mode !== 'worker') return request.apply();
  evidence.usageMeasurements(request.event);
  const observation = await store.observe(db, request);
  if (!observation) return request.apply();
  return withTransaction(db, async () => {
    const input = { runId: observation.binding.runId, eventKey: observation.eventKey };
    const current = await store.observation(db, input);
    if (current.applied === 1) {
      const run = await events.getRun(db, input.runId);
      return { run, halt: run.status === 'blocked', duplicate: true,
        biologicalReceipt: await finalize(db, input.runId) };
    }
    const saved = await request.apply();
    const receipt = await finalize(db, input.runId);
    if (receipt && !receipt.evidence.observations.includes(current.event_hash)) {
      throw store.biologyError('BIOLOGICAL_WORKER_RECEIPT_SEALED');
    }
    if (!saved && !receipt) throw store.biologyError('BIOLOGICAL_WORKER_OBSERVATION_UNAPPLIED');
    await store.markApplied(db, input);
    return saved && { ...saved, biologicalReceipt: receipt };
  });
}

async function recover(db, missionId) {
  await store.ensure(db);
  await recoverPending(db, missionId);
  const rows = await db.all(`SELECT b.run_id FROM biological_worker_bindings b
    JOIN strategy_execution_runs r ON r.id = b.run_id WHERE b.mission_id = ?
    AND r.status IN ('completed', 'failed', 'blocked', 'cancelled')`, missionId);
  for (const row of rows) await withTransaction(db, () => finalize(db, row.run_id));
  return rows.length;
}

async function recoverPending(db, missionId) {
  const pending = await db.all(`SELECT o.*, b.agent_id FROM biological_worker_observations o
    JOIN biological_worker_bindings b ON b.run_id = o.run_id JOIN strategy_execution_runs r ON r.id = o.run_id
    WHERE b.mission_id = ? AND o.applied = 0 AND r.status IN ('planned', 'running') ORDER BY o.rowid`, missionId);
  for (const row of pending) {
    const event = store.verifiedJson(row, 'event_json');
    await record(db, { agentId: row.agent_id, event,
      apply: () => require('./strategyExecutionProgress').recordExecutionEvent(db, row.agent_id, event) });
  }
}

function successfulTerminal(snapshot) {
  return ['AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN'].includes(snapshot.terminalEvent);
}

async function missionEvidence(db, missionId) {
  await recover(db, missionId);
  const members = await db.all(`SELECT a.* FROM agents a JOIN mission_agents ma ON ma.agent_id = a.id
    WHERE ma.mission_id = ? AND a.execution_mode = 'worker'`, missionId);
  const workers = await require('./regenerationAttemptService').effectiveAgents(db, missionId, members);
  const results = [];
  for (const worker of workers) {
    const run = await db.get('SELECT id, status FROM strategy_execution_runs WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1', worker.id);
    const receipt = run && await store.receipt(db, run.id);
    const complete = receipt && receipt.missionId === missionId && run.status === receipt.result.status
      && await observationsComplete(db, receipt);
    results.push({ workerId: worker.id, runId: run?.id || null, receipt, complete });
  }
  const missing = results.filter(item => !item.receipt).map(item => item.workerId);
  const rejected = results.filter(item => item.receipt && !receiptSatisfied(item)).map(item => item.workerId);
  return { satisfied: missing.length === 0 && rejected.length === 0, missing, rejected,
    receipts: results.filter(item => item.receipt).map(item => item.receipt) };
}

function receiptSatisfied(item) {
  return item.complete && item.receipt.result.verified === true && item.receipt.budgetAssessment.satisfied === true;
}

async function observationsComplete(db, receipt) {
  const observations = await store.observations(db, receipt.runId);
  return observations.every(item => item.applied)
    && digest(observations.map(item => item.hash)) === digest(receipt.evidence.observations);
}

module.exports = { finalize, record, recover, missionEvidence, TERMINAL_STATUSES };
