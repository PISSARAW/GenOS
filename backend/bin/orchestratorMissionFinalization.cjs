'use strict';

const { resolveFinalMissionStatus } = require('../src/services/orchestratorMissionStatus');

function finalizeMissionStatus({ outcome, completionGate, finalVerdict, coverage }) {
  const finalStatus = resolveFinalMissionStatus(outcome, completionGate, { verdict: finalVerdict, coverage });
  return { finalStatus, finalVerdict: finalStatus.verdict };
}

function destructureContResult(contResult, fallback) {
  return {
    continuity: contResult.continuity ?? fallback.continuity,
    completionGate: contResult.completionGate ?? fallback.completionGate,
    homeostasis: contResult.homeostasis ?? fallback.homeostasis,
    organism: contResult.organism ?? fallback.organism,
    finalVerdict: contResult.finalVerdict ?? fallback.finalVerdict,
    outcome: contResult.outcome ?? fallback.outcome,
    mission: contResult.mission ?? fallback.mission
  };
}

function computeFinalVerdict(missionSuccess, outcome, completionGate) {
  return missionSuccess ? outcome.verdict : (completionGate.allowed === false && outcome.success === true ? 'homeostasis_blocked' : outcome.verdict);
}

async function settleDeferredAgent({ agentId, status, verdict }) {
  await require('../src/services/agentOrchestrationState').updateAgent(agentId, status, `Mission ${verdict}`);
}

module.exports = { finalizeMissionStatus, destructureContResult, computeFinalVerdict, settleDeferredAgent };
