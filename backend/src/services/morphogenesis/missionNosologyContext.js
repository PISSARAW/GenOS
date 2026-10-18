'use strict';

const evidenceAdapter = require('./morphogenesisNosologyEvidence');
const bridge = require('./morphogenesisNosologyBridge');

function evidenceScope(ctx) {
  const mission = ctx.normalizedMission || {};
  return { db: ctx.db, agentIds: [ctx.agentId], missionId: mission.missionId || ctx.agentId,
    organizationId: ctx.organizationId || mission.organizationId,
    projectId: ctx.projectId || mission.projectId };
}

async function loadMissionNosology(ctx) {
  const evidence = await evidenceAdapter.loadNosologyEvidence(evidenceScope(ctx));
  return bridge.compileNosologyBridge({ evidence, orchestratorId: ctx.agentId,
    runtimeSignals: { failures: 0 }, state: { results: new Map(),
      normalizedMission: ctx.normalizedMission || {} } });
}

function assertPlanningAllowed(nosology) {
  if (nosology?.gate?.status !== 'blocked') return;
  throw Object.assign(new Error('Morphogenesis planning denied: orchestrator quarantined.'), {
    code: 'MORPHOGENESIS_CLINICAL_GATE_BLOCKED', nosology
  });
}

function enrichPlanningInput(input, nosology) {
  if (!nosology) return input;
  const diagnosis = bridge.mergeSignals(input.diagnosis || {}, nosology);
  return { ...input, diagnosis, nosology,
    problemProfile: { ...(input.problemProfile || {}), ...diagnosis } };
}

function bindNosology(plan, nosology) {
  if (!plan || !nosology) return plan;
  plan.nosology = nosology;
  plan.clinicalGate = nosology.gate.status;
  plan.clinicalResponse = nosology.response;
  return plan;
}

module.exports = { loadMissionNosology, assertPlanningAllowed, enrichPlanningInput, bindNosology };
