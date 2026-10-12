'use strict';

const { digest } = require('./biologicalIntegrity');
const { readAssembly } = require('./aeisAssemblyStore');
const workerStore = require('./biologicalWorkerStore');
const nativeGate = require('./epistemic/nativeOracleGate');
const missionOutcome = require('./missionOutcomeContract');
const contracts = require('./strategyContractService');
const { evaluateEpistemicAssurance } = require('./epistemicAssuranceService');
const { listVerifierDigests } = require('./verifierTrustRegistry');
const MODEL_ORACLE_DOMAIN = 'model_subset_sum';
const OUTPUT_BINDING_SCHEMA = 'genos.model-oracle-output/v1';
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

function validAttemptIdentity(attempt, run, scope) {
  return attempt.agent_id === run.agent_id
    && attempt.organization_id === scope.organization_id
    && attempt.project_id === scope.project_id
    && attempt.status === 'completed' && attempt.provider_called === 1
    && attempt.token_usage_source === 'provider';
}

function validAttemptUsage(attempt) {
  return Number.isSafeInteger(attempt.input_tokens) && attempt.input_tokens >= 0
    && Number.isSafeInteger(attempt.output_tokens) && attempt.output_tokens >= 0
    && Number.isSafeInteger(attempt.input_tokens + attempt.output_tokens)
    && attempt.input_tokens + attempt.output_tokens > 0
    && Number.isFinite(attempt.cost_usd) && attempt.cost_usd >= 0;
}

function costMatchesReceipt(attempt, receipt) {
  const amounts = Object.fromEntries((receipt.costs || []).map((item) => [item.register, item.quantity]));
  return amounts.worker_llm_tokens === attempt.input_tokens + attempt.output_tokens
    && Number.isFinite(amounts.worker_provider_billing)
    && Math.abs(amounts.worker_provider_billing - attempt.cost_usd) <= 0.000001;
}

function observedIdentityMatches(attempt, event) {
  const payload = event.payload || {};
  return event.id === `mission-model-usage:${attempt.id}`
    && payload.routeAttemptId === attempt.id
    && payload.actionId === attempt.action_id
    && payload.executionRunId === attempt.mission_id
    && payload.usageSource === 'provider';
}

function observedValueMatches(attempt, payload) {
  return payload.outputEncoding === 'utf8-raw-text'
    && SHA256.test(payload.outputDigest)
    && payload.usage?.input_tokens === attempt.input_tokens
    && payload.usage.output_tokens === attempt.output_tokens
    && Math.abs(payload.usage.cost_usd - attempt.cost_usd) <= 0.000001;
}

function observedAttempt(attempt, observations) {
  const matches = observations.map((item, index) => ({ item, index })).filter(({ item }) =>
    item.event.eventType === 'MODEL_USAGE_OBSERVED');
  const evidenceIndex = observations.findIndex((item) => item.event.eventType === 'EVIDENCE_REPORT');
  if (matches.length !== 1 || evidenceIndex < 0 || matches[0].index >= evidenceIndex) return null;
  const event = matches[0].item.event;
  return observedIdentityMatches(attempt, event)
    && observedValueMatches(attempt, event.payload || {}) ? event.payload.outputDigest : null;
}

function measuredAttempt(input) {
  const { attempts, run, scope, receipt, observations } = input;
  const outputDigest = attempts.length === 1 ? observedAttempt(attempts[0], observations) : null;
  if (attempts.length !== 1 || !validAttemptIdentity(attempts[0], run, scope)
      || !validAttemptUsage(attempts[0]) || !costMatchesReceipt(attempts[0], receipt)
      || !outputDigest) return null;
  const measured = withinRun(attempts[0], run);
  return measured && { ...measured, outputDigest };
}

function withinRun(attempt, run) {
  const started = Date.parse(attempt.started_at);
  const finished = Date.parse(attempt.finished_at);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started
      || started < Date.parse(run.started_at) || finished > Date.parse(run.completed_at)) return null;
  return { attempt, latencyMs: finished - started };
}

async function verifiedReceipt(db, run) {
  const receipt = await workerStore.receipt(db, run.id);
  const binding = await workerStore.binding(db, run.id);
  if (!receiptMatches(receipt, binding, run)) return null;
  const observations = await workerStore.observations(db, run.id);
  if (!observationsMatch(observations, receipt)) return null;
  const terminal = observations.filter((item) => item.event.eventType === 'AGENT_COMPLETED').at(-1);
  return terminal ? { receipt, terminal, observations } : null;
}

function receiptMatches(receipt, binding, run) {
  return receipt?.runId === run.id && receipt.workerId === run.agent_id
    && receipt.result?.verified === true && receipt.budgetAssessment?.satisfied === true
    && binding?.contractId === run.contract_id && binding.contractVersion === run.contract_version
    && receipt.bindingHash === digest(binding);
}

function observationsMatch(observations, receipt) {
  return observations.length > 0 && observations.every((item) => item.applied)
    && digest(observations.map((item) => item.hash)) === digest(receipt.evidence?.observations);
}

async function verifiedMission(db, run) {
  if (run?.status !== 'completed' || run.guardrail_reason) return null;
  const selected = await verifiedReceipt(db, run);
  if (!selected) return null;
  const { receipt, terminal } = selected;
  const historical = await nativeGate.historical(db, { runId: run.id, agentId: run.agent_id,
    event: terminal.event });
  if (!historicalMatches(historical, receipt)) return null;
  const assemblyId = historical.proof.attestation.value.assemblyId;
  const active = await readAssembly(db, assemblyId);
  if (!assemblyMatches(active, run)) return null;
  if (!await acceptedContract(db, { run, historical, terminal })) return null;
  return { assemblyId, scopeId: active.scopeId, receipt,
    oracleDomain: historical.proof.attestation.value.domain,
    assembly: active.evaluation.assembly,
    observations: selected.observations };
}

function modelClaimMatches(proof, run, measured) {
  if (proof.oracleDomain !== MODEL_ORACLE_DOMAIN) return false;
  const results = proof.assembly?.results;
  if (!Array.isArray(results) || results.length !== 1) return false;
  const output = results[0].evidence?.content?.modelOutput;
  return output?.schema === OUTPUT_BINDING_SCHEMA
    && output.encoding === 'utf8-raw-text'
    && output.runId === run.id
    && output.actionId === measured.attempt.action_id
    && output.routeAttemptId === measured.attempt.id
    && output.digest === measured.outputDigest;
}

function historicalMatches(historical, receipt) {
  return Boolean(historical && historical.acceptance.value.status === 'completed'
    && receipt.semanticVerification?.hash === historical.proof.attestation.hash
    && receipt.semanticVerification.acceptanceHash === historical.acceptance.hash);
}

function assemblyMatches(active, run) {
  if (active.runId !== run.id || active.evaluation.allAccepted !== true) return false;
  const current = evaluateEpistemicAssurance({ ...active.evaluation.assembly,
    trustedVerifierDigests: listVerifierDigests() });
  return current.eligible && active.evaluation.evaluation?.eligible === true
    && current.assemblyDigest === active.evaluation.evaluation.assemblyDigest;
}

async function acceptedContract(db, input) {
  const { run, historical, terminal } = input;
  const record = await contracts.getContractById(db, run.contract_id);
  if (!record || record.version !== run.contract_version) return false;
  if (!record.contract.mission_outcome) return true;
  const verified = missionOutcome.evaluate(record.contract.mission_outcome, historical,
    { ...terminal.event, runId: run.id });
  return verified?.status === 'verified';
}

async function verifiedAction(db, input) {
  const { run, attempt, receipt } = input;
  const row = await db.get(`SELECT * FROM mission_action_decisions
    WHERE run_id=? AND action_id=? AND mode='active'`, run.id, attempt.action_id);
  let journal;
  try { journal = JSON.parse(row?.journal_json); } catch (_) { return false; }
  return row?.status === 'executed_unverified'
    && row.mission_id === receipt.missionId && journal?.selectedId === attempt.action_id
    && journal.alternatives?.some((item) => item.id === attempt.action_id
      && ['small_model', 'large_model'].includes(item.kind) && item.eligible === true)
    && typeof row.result_digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(row.result_digest)
    && Date.parse(row.closed_at) <= Date.parse(run.completed_at);
}

async function verifiedMeasuredAction(db, input) {
  const { run, proof, scope } = input;
  const attempts = await db.all('SELECT * FROM model_attempt_ledger WHERE mission_id=?', run.id);
  const measured = measuredAttempt({ attempts, run, scope,
    receipt: proof.receipt, observations: proof.observations });
  if (!measured || !modelClaimMatches(proof, run, measured)) return null;
  return await verifiedAction(db, { run, attempt: measured.attempt,
    receipt: proof.receipt }) ? measured : null;
}

async function derive(db, missionId) {
  if (!db || typeof missionId !== 'string' || !missionId.trim()) return null;
  try {
    const run = await db.get('SELECT * FROM strategy_execution_runs WHERE id=?', missionId);
    const proof = await verifiedMission(db, run);
    if (!proof) return null;
    const scope = await db.get(`SELECT a.execution_mode, a.workspace_id, w.organization_id, w.project_id
      FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, run.agent_id);
    if (scope?.execution_mode !== 'worker'
        || proof.scopeId !== [scope.organization_id, scope.project_id, scope.workspace_id].join(':')) return null;
    const measured = await verifiedMeasuredAction(db, { run, proof, scope });
    if (!measured) return null;
    return { missionId, scopeId: proof.scopeId, routeAttemptId: measured.attempt.id,
      routeUri: measured.attempt.model, success: true,
      verification: { assemblyId: proof.assemblyId, source: 'native_mission' },
      costUsd: measured.attempt.cost_usd, latencyMs: measured.latencyMs,
      promptTokens: measured.attempt.input_tokens };
  } catch (_) { return null; }
}

function matches(data, derived) {
  if (!derived) return false;
  const fields = ['missionId', 'scopeId', 'routeAttemptId', 'routeUri', 'success',
    'costUsd', 'latencyMs', 'promptTokens'];
  return fields.every((field) => data[field] === derived[field])
    && data.verification?.assemblyId === derived.verification.assemblyId;
}

async function ingestWithTrace(db, missionId) {
  const derived = await derive(db, missionId);
  if (!derived) return { status: 'refused', reason: 'mission_evidence_ineligible' };
  return require('./routingBanditService').observeWithStatus(db, derived);
}

async function ingest(db, missionId) {
  const result = await ingestWithTrace(db, missionId);
  return result.status === 'observed' ? result.observation : null;
}

module.exports = { derive, matches, ingest, ingestWithTrace, modelClaimMatches };
