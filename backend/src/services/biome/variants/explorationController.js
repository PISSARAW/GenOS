'use strict';

const foraging = require('../foraging/ecologicalForagingController');
const actionExecutor = require('../foraging/foragingActionExecutor');

function advance(ecology, state, input) {
  const observations = Array.isArray(state.noveltyArchive) ? state.noveltyArchive : [];
  const history = Array.isArray(input.patchHistory) ? input.patchHistory : [];
  const curiosity = curiosityPressure(input, state);
  const decision = foraging.decide({
    ecology, patchHistory: history, currentPatchId: input.currentPatchId,
    currentDescriptor: input.currentDescriptor, currentMarginalReturn: input.currentMarginalReturn,
    currentSpace: input.currentSpace, alternatives: enrichAlternatives(input.alternatives, observations, curiosity),
    stepsWithoutProgress: input.stepsWithoutProgress, elapsedTimeSec: input.elapsedTimeSec,
    environmentThreshold: input.environmentThreshold, switchCost: input.switchCost, random: input.random
  });
  const executed = input.execute === false ? null : actionExecutor.execute(ecology, decision, input);
  const patch = decision.alternative?.patchId;
  const archive = patch && input.evidenceRefs?.length ? [...observations, {
    patchId: patch, descriptor: decision.alternative.descriptor, informationGain: decision.alternative.informationValue,
    evidenceRefs: input.evidenceRefs, discoveredAtTick: ecology.tick
  }].slice(-500) : observations;
  const transfers = transferDiscoveries(archive, input.transferPatchId, input.evidenceRefs);
  const score = explorationScore(decision, observations.length, curiosity);
  return { state: { ...state, noveltyArchive: archive, explorationPressure: score },
    decision: { ...decision, score, curiosity, transfers, execution: executed, noveltyArchiveSize: archive.length },
    action: executed?.action || { type: 'EXPLORATION_POLICY_EVALUATED', status: 'applied' } };
}

function enrichAlternatives(alternatives, archive, curiosity) {
  return (Array.isArray(alternatives) ? alternatives : []).map((patch) => {
    const known = archive.find((item) => item.patchId === patch.patchId);
    return { ...patch, novelty: known ? 0 : Math.max(0, Number(patch.novelty) || 0),
      expectedInformationGain: Math.max(0, Number(patch.expectedInformationGain) || 0) * (0.25 + curiosity * 1.75) };
  });
}

function curiosityPressure(input, state) {
  const explicit = clamp(input.curiosity);
  const stagnation = Math.min(1, Math.max(0, Number(input.stepsWithoutProgress) || 0) / 5);
  const priorGain = state.noveltyArchive?.at(-1)?.informationGain || 0;
  return Number(Math.min(1, explicit * 0.5 + stagnation * 0.4 + (priorGain === 0 ? 0.1 : 0)).toFixed(6));
}

function transferDiscoveries(archive, targetPatchId, evidenceRefs) {
  if (!targetPatchId) return [];
  return archive.filter((item) => item.patchId !== targetPatchId && item.evidenceRefs.length
    && item.evidenceRefs.every((ref) => evidenceRefs.includes(ref)))
    .map((item) => ({ from: item.patchId, to: targetPatchId, evidenceRefs: item.evidenceRefs }));
}

function explorationScore(decision, archiveSize, curiosity) {
  const information = Math.max(0, decision.alternative?.informationValue || 0);
  const stagnation = Math.max(0, Number(decision.explorationMove?.stepLength) || 0);
  return Number((information + stagnation * 0.1 + Math.max(0, Number(curiosity) || 0)
    - Math.log1p(archiveSize) * 0.01).toFixed(6));
}

function clamp(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5; }

module.exports = { advance };
