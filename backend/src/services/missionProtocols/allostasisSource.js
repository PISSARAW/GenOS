'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const context = require('./context');

async function describe(binding) {
  await context.assertCurrent(binding);
  const sealed = await require('../missionEnvelopeAuthority').read(binding.db, binding.runId);
  const capacity = sealed.envelope.budgets.timeMs;
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('ALLOSTASIS exact sealed time budget required.');
  const reserve = Math.floor(capacity / 20);
  const evidence = [sealed.eventId];
  const provenance = { sourceId: sealed.eventId, sourceDigest: digest(sealed.envelope),
    evidenceRefs: evidence, method: 'sealed_runtime_budget_exact_no_viability_inference' };
  const report = { reportId: `${binding.runId}:time-state`, status: 'available',
    scope: binding.scope, missionId: binding.missionId, subject: { level: 'agent', subjectId: binding.agentId },
    observedAt: sealed.envelope.issuedAt, validUntil: sealed.envelope.expiresAt, reasons: [],
    measurements: [{ metricId: 'wall_time_ceiling', unit: 'milliseconds', value: capacity,
      uncertainty: { kind: 'interval', lower: capacity, upper: capacity }, quantization: null, provenance }],
    nativeSnapshot: { service: 'mission.sealedBudget/v1', sourceAgentId: binding.agentId,
      storageScope: binding.runId, level: 'agent', rawState: { envelopeHash: sealed.hash, capacity },
      scopeState: { status: 'measured', variables: { capacity },
        sampledAt: Date.parse(sealed.envelope.issuedAt), evidenceRefs: evidence } } };
  const forecast = { forecastId: `${binding.runId}:time-need`, reportId: report.reportId,
    reportDigest: digest(report), scope: binding.scope, missionId: binding.missionId, subject: report.subject,
    unit: 'milliseconds', amount: capacity - reserve,
    horizon: { unit: 'milliseconds', amount: capacity - reserve }, producedAt: report.observedAt,
    validUntil: report.validUntil, uncertainty: { kind: 'unknown' }, provenance, demandSource: 'declared',
    nativeCandidate: { candidateId: binding.runId, source: 'sealed-runtime-budget', envelopeHash: sealed.hash },
    nativeAssessment: { available: false, reason: 'runtime_ceiling_is_not_a_viability_forecast' } };
  return { capacity, reserve, report, forecast };
}

async function qualify(binding, input) {
  const source = await describe(binding);
  const kind = input.report ? 'report' : 'forecast';
  const value = source[kind];
  if (digest(input[kind]) !== digest(value)) throw new Error('ALLOSTASIS runtime source differs from sealed budget.');
  return { available: true, [kind]: value, [`${kind}Digest`]: digest(value),
    report: source.report, allocationAuthorized: false };
}

async function regulator(binding) {
  const row = await binding.db.get(`SELECT parent_agent_id FROM agents WHERE id=?`, binding.agentId);
  if (!row?.parent_agent_id) return null;
  const run = await binding.db.get(`SELECT id FROM strategy_execution_runs
    WHERE agent_id=? ORDER BY rowid DESC LIMIT 1`, row.parent_agent_id);
  if (!run) throw new Error('ALLOSTASIS real parent execution incarnation required.');
  const scope = await require('../gvxMissionProvenance').requireAgentScope(binding.db, row.parent_agent_id);
  if (scope.organizationId !== binding.scope.organizationId || scope.projectId !== binding.scope.projectId) {
    throw new Error('ALLOSTASIS regulator tenant mismatch.');
  }
  return { agentId: row.parent_agent_id, incarnationId: run.id, trustDomain: scope.organizationId };
}

module.exports = { describe, qualify, regulator };
