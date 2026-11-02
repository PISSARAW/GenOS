'use strict';

const store = require('../biologicalWorkerStore');
const journal = require('../epistemic/nativeOracleJournal');
const { digest } = require('../biologicalIntegrity');
const observationContract = require('./missionObservationContract');

async function runEvidence(input) {
  const { db, binding } = input;
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE id=? AND agent_id=?', binding.runId, binding.agentId);
  if (run?.status !== 'blocked' || run.guardrail_reason !== 'ORACLE_ASSEMBLY_NOT_ACCEPTED') {
    throw new Error('agow-refutation-semantic-block-required');
  }
  const sealed = await store.binding(db, run.id);
  const receipt = await store.receipt(db, run.id);
  if (sealed?.workerId !== binding.agentId || sealed.missionId !== binding.missionId || sealed.runId !== binding.runId) {
    throw new Error('agow-refutation-owner-mismatch');
  }
  validateBiologicalReceipt({ sealed, receipt, run });
  const records = await store.observations(db, run.id);
  const terminal = canonicalTerminal(records, input);
  if (digest(records.map((record) => record.hash)) !== digest(receipt.evidence.observations)) {
    throw new Error('agow-refutation-observation-chain-mismatch');
  }
  return { run, terminal };
}

function validateBiologicalReceipt(input) {
  const { sealed, receipt, run } = input;
  if (receipt?.bindingHash !== digest(sealed) || receipt.runId !== run.id
    || receipt.result?.verified !== false || receipt.result.status !== run.status
    || receipt.budgetAssessment?.satisfied !== true) throw new Error('agow-refutation-biological-receipt-required');
}

function canonicalTerminal(records, input) {
  if (!records.length || records.some((record) => !record.applied)) throw new Error('agow-refutation-observations-unapplied');
  const completed = records.filter((record) => record.event.eventType === 'AGENT_COMPLETED');
  if (completed.length !== 1) throw new Error('agow-refutation-single-terminal-required');
  const terminal = completed[0].event;
  const actual = observationContract.eventIdentity(terminal, input.binding);
  if (digest(actual) !== digest(input.eventIdentity)) throw new Error('agow-refutation-terminal-mismatch');
  return terminal;
}

async function readProof(input, terminal) {
  const scope = await require('../gvxMissionProvenance').requireAgentScope(input.db, input.binding.agentId);
  const request = { runId: input.binding.runId, agentId: input.binding.agentId, scope };
  const attestation = await journal.read(input.db, { ...request, kind: 'attestation' });
  const allocation = await journal.read(input.db, { ...request, kind: 'reservation' });
  const reference = terminal.payload.nativeOracleRef;
  if (!attestation || reference?.hash !== attestation.hash || reference.eventId !== attestation.eventId) {
    throw new Error('agow-refutation-reference-invalid');
  }
  validateAttestation(attestation.value, { request, allocation });
  await assertUnaccepted(input.db, request);
  const authority = await require('../missionEnvelopeAuthority').assertRun(input.db, request);
  if (authority.hash !== attestation.value.authorityHash) throw new Error('agow-refutation-authority-mismatch');
  const saved = await require('../aeisAssemblyStore').readAssembly(input.db, attestation.value.assemblyId);
  if (saved.runId !== request.runId || saved.scopeId !== attestation.value.scopeId || saved.evaluation.allAccepted !== false) {
    throw new Error('agow-refutation-assembly-mismatch');
  }
  const costs = await require('../epistemic/nativeOracleExecutionJournal').costs(input.db, { allocation });
  if (digest(costs) !== digest(attestation.value.costs)) throw new Error('agow-refutation-costs-changed');
  return { attestation, allocation, saved, request };
}

async function assertUnaccepted(db, request) {
  if (await journal.read(db, { ...request, kind: 'acceptance' })) throw new Error('agow-refutation-must-not-be-accepted');
  if (await journal.read(db, { ...request, kind: 'abort' })) throw new Error('agow-refutation-aborted');
}

function validateAttestation(record, context) {
  const { request, allocation } = context;
  if (record.schema !== 'genos.native-oracle-attestation/v1' || record.accepted !== false || record.domain !== 'subset_sum') {
    throw new Error('agow-refutation-attestation-required');
  }
  if (record.runId !== request.runId || record.agentId !== request.agentId || digest(record.scope) !== digest(request.scope)) {
    throw new Error('agow-refutation-scope-mismatch');
  }
  if (!allocation || record.allocationHash !== allocation.hash) throw new Error('agow-refutation-allocation-mismatch');
  validateAllocationOwner(allocation.value, request);
  const fields = ['subjectHash', 'reportHash', 'authorityHash'];
  if (fields.some((field) => record[field] !== allocation.value[field])) throw new Error('agow-refutation-allocation-mismatch');
  validateBudget(record, allocation.value);
}

function validateAllocationOwner(allocation, request) {
  if (allocation.runId !== request.runId || allocation.agentId !== request.agentId
    || allocation.domain !== 'subset_sum' || digest(allocation.scope) !== digest(request.scope)) {
    throw new Error('agow-refutation-allocation-scope-mismatch');
  }
}

function validateBudget(record, allocation) {
  const costs = record.costs;
  if (costs?.complete !== true || costs.processes !== 2 || allocation.limits.executions !== 2) {
    throw new Error('agow-refutation-complete-budget-required');
  }
  if (!Number.isFinite(costs.runtimeMs) || costs.runtimeMs < 0 || costs.runtimeMs > allocation.limits.latencyMs) {
    throw new Error('agow-refutation-budget-exceeded');
  }
  validateTimes(record, allocation);
}

function validateTimes(record, allocation) {
  const times = [record.completedAt, allocation.expiresAt, record.validUntil].map((value) => Date.parse(value));
  if (!times.every(Number.isFinite) || times[0] > times[1] || Date.now() >= times[2]) {
    throw new Error('agow-refutation-expired');
  }
}

async function verify(input) {
  if (input.binding.measurementContract !== 'genos.agow.native-subset-outcome/v2') {
    throw new Error('agow-refutation-contract-required');
  }
  const { run, terminal } = await runEvidence(input);
  const proof = await readProof(input, terminal);
  const subject = await require('../epistemic/nativeOracleDomains').load(input.db, proof.request);
  if (digest(subject) !== proof.attestation.value.subjectHash
    || digest(terminal.payload.evidenceReport) !== proof.attestation.value.reportHash) throw new Error('agow-refutation-source-changed');
  const ended = Date.parse(run.completed_at);
  const checked = Date.parse(proof.attestation.value.completedAt);
  if (!Number.isFinite(ended) || ended < checked || ended > Date.parse(proof.attestation.value.validUntil)) {
    throw new Error('agow-refutation-run-time-mismatch');
  }
  const receipts = require('./nativeRefutationReceipts').check(proof, subject);
  await verifyExecutions(input.db, proof, receipts);
  return { verified: true, verifierId: receipts[0].verifierDigest,
    bindingHash: input.binding.bindingHash, eventDigest: input.eventIdentity.eventDigest,
    evidenceRefs: [proof.attestation.eventId, proof.attestation.hash,
      ...receipts.map((receipt) => `verifier-nonce:${receipt.nonce}`)],
    metrics: { realizedLoss: 1, goalProgress: 0, resourceReserve: null,
      missionStability: null, blockageEvents: null, viabilityViolations: null } };
}

async function verifyExecutions(db, proof, receipts) {
  const fields = ['executionId', 'strategy', 'cwd', 'inputDigest', 'executable', 'implementation',
    'startedAt', 'timeoutMs', 'processId', 'exitCode', 'durationMs', 'timedOut', 'spawnError'];
  for (const receipt of receipts) {
    const execution = receipt.executionEvidence[0];
    const saved = await journal.read(db, { ...proof.request,
      kind: `execution_${execution.postconditions.strategy}_finished` });
    if (!saved || saved.value.allocationHash !== proof.allocation.hash
      || saved.value.execution.processOutcome !== 'refuted') throw new Error('agow-refutation-execution-journal-mismatch');
    if (fields.some((field) => saved.value.execution[field] !== execution[field])) {
      throw new Error('agow-refutation-execution-journal-mismatch');
    }
  }
}

module.exports = { verify };
