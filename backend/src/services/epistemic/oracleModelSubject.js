'use strict';

const crypto = require('node:crypto');
const values = require('../trinityProvenanceValues');
const provenance = require('../gvxMissionProvenance');
const store = require('../biologicalWorkerStore');
const { createFormalResult } = require('../formalResultService');

const STATEMENT = 'La réponse model_subset_sum observée satisfait les postconditions indépendantes.';
const DOMAIN = { statement: 'Réponse JSON UTF-8 d’un modèle pour subset_sum borné.',
  constraints: ['La sortie brute est liée à une tentative modèle mesurée.',
    'Deux algorithmes indépendants vérifient le résultat déclaré.'] };
const MAX_AGE_MS = 600000;
function denied(code) { throw values.failure(code); }
function digestText(text) {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function observedPair(records) {
  const reports = records.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.applied && item.event.eventType === 'EVIDENCE_REPORT');
  const last = reports.at(-1);
  if (!last) denied('ORACLE_RESULT_OBSERVATION_REQUIRED');
  const output = last.item.event.payload?.evidenceReport?.workerArtifact?.content?.modelOutput;
  const usages = records.slice(0, last.index).filter((item) => item.applied
    && item.event.eventType === 'MODEL_USAGE_OBSERVED');
  if (usages.length !== 1 || !output) denied('ORACLE_MODEL_OBSERVATION_REQUIRED');
  return { report: last.item, usage: usages[0], output };
}

function validOutputText(output, payload) {
  return output.schema === 'genos.model-oracle-output/v1'
    && output.encoding === 'utf8-raw-text' && typeof output.text === 'string'
    && Buffer.byteLength(output.text, 'utf8') <= 16384
    && output.digest === digestText(output.text)
    && output.digest === payload.outputDigest;
}

function validOutputOwner(input, payload) {
  const { output, request } = input;
  return output.runId === request.runId && output.actionId === payload.actionId
    && output.routeAttemptId === payload.routeAttemptId
    && payload.executionRunId === request.runId && payload.usageSource === 'provider';
}

function assertModelOutput(input) {
  const payload = input.usage.event.payload || {};
  if (!validOutputText(input.output, payload) || !validOutputOwner(input, payload)) {
    denied('ORACLE_MODEL_OUTPUT_BINDING_INVALID');
  }
}

async function assertAttempt(db, input) {
  const { request, usage, output } = input;
  const row = await db.get('SELECT * FROM model_attempt_ledger WHERE id=?', output.routeAttemptId);
  if (!validAttemptOwner({ row, request, output })
      || !validAttemptMeasurement(row, usage.event.payload?.usage)) {
    denied('ORACLE_MODEL_ATTEMPT_INVALID');
  }
}

function validAttemptOwner(input) {
  const { row, request, output } = input;
  return row && row.mission_id === request.runId && row.agent_id === request.agentId
    && row.organization_id === request.scope.organizationId
    && row.project_id === request.scope.projectId
    && row.action_id === output.actionId && row.status === 'completed'
    && row.provider_called === 1 && row.token_usage_source === 'provider';
}

function validAttemptMeasurement(row, usage) {
  return Number.isSafeInteger(row.input_tokens) && row.input_tokens >= 0
    && Number.isSafeInteger(row.output_tokens) && row.output_tokens >= 0
    && row.input_tokens + row.output_tokens > 0
    && Number.isFinite(row.cost_usd) && row.cost_usd >= 0
    && usage?.input_tokens === row.input_tokens
    && usage.output_tokens === row.output_tokens && usage.cost_usd === row.cost_usd;
}

function assertBinding(input) {
  const { runBinding, binding, request } = input;
  if (!runBinding || binding?.workerId !== request.agentId
      || request.scope.entityId !== request.agentId) denied('ORACLE_RUNTIME_SUBJECT_MISMATCH');
}

function assertFresh(event) {
  const age = Date.now() - Date.parse(event.timestamp);
  if (!Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) denied('ORACLE_SOURCE_STALE');
}

async function load(db, request) {
  if (!db || !request?.runId || !request.agentId || !request.scope) denied('ORACLE_RUNTIME_SUBJECT_REQUIRED');
  const runBinding = await provenance.readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  const method = binding?.genome.workerContract?.mission?.methodContract;
  assertBinding({ runBinding, binding, request });
  if (method?.version !== 1 || method.methodId !== 'model_subset_sum') denied('ORACLE_DOMAIN_UNAVAILABLE');
  const pair = observedPair(await store.observations(db, request.runId));
  assertModelOutput({ ...pair, request });
  await assertAttempt(db, { ...pair, request });
  assertFresh(pair.report.event);
  return { domain: 'model_subset_sum', runId: request.runId, workerId: request.agentId,
    content: { runId: request.runId, workerId: request.agentId,
      method: { ...method, methodId: 'subset_sum' }, modelOutput: pair.output },
    observationHash: pair.report.hash, observedAt: pair.report.event.timestamp,
    runBindingHash: runBinding.hash, bindingHash: values.digest(binding),
    validUntil: new Date(Date.parse(pair.report.event.timestamp) + MAX_AGE_MS).toISOString() };
}

function assertAntigen(antigen, subject) {
  if (!antigen?.formalResult) denied('ORACLE_FORMAL_RESULT_REQUIRED');
  const formal = createFormalResult(antigen.formalResult);
  if (formal.canonicalStatement !== STATEMENT || antigen.claim !== STATEMENT
      || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest
      || values.digest(formal.evidence.content) !== values.digest(subject.content)
      || values.digest(formal.validityDomain) !== values.digest({ ...DOMAIN,
        constraints: [...DOMAIN.constraints].sort() })) denied('ORACLE_CLAIM_BINDING_MISMATCH');
  return formal;
}

module.exports = { STATEMENT, DOMAIN, MAX_AGE_MS, load, assertAntigen, digestText };
