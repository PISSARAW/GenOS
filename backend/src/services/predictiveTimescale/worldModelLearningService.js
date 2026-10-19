'use strict';

function memoryState(state) {
  state.episodes = { ...(state.episodes || {}) };
  state.semanticMemory = { ...(state.semanticMemory || {}) };
  state.assumptionLedger = { ...(state.assumptionLedger || {}) };
  return state;
}

function semanticKey(prediction) {
  return [prediction.modelId, prediction.contextKey, prediction.metric].join('|');
}

function average(previous, sample, count) {
  return previous + ((sample - previous) / count);
}

function updateSemantic(state, prediction, observation) {
  const key = semanticKey(prediction);
  const previous = state.semanticMemory[key] || { sampleCount: 0, meanAbsoluteError: 0,
    meanSquaredError: 0, toleranceCoverage: 0, calibratedConfidence: 0 };
  const sampleCount = previous.sampleCount + 1;
  const absoluteError = Math.abs(observation.residual);
  const coverage = Number(absoluteError <= prediction.falsificationTolerance);
  const next = { sampleCount,
    meanAbsoluteError: average(previous.meanAbsoluteError, absoluteError, sampleCount),
    meanSquaredError: average(previous.meanSquaredError, observation.residual ** 2, sampleCount),
    toleranceCoverage: average(previous.toleranceCoverage, coverage, sampleCount),
    lastObservationId: observation.observationId,
    provenance: { predictionCommitment: prediction.commitment,
      signerFingerprint: observation.signerFingerprint, evidenceRefs: observation.evidenceRefs } };
  const maturity = sampleCount / (sampleCount + 3);
  next.calibratedConfidence = Math.max(0.05, Math.min(0.99,
    (prediction.confidence * (1 - maturity)) + (next.toleranceCoverage * maturity)));
  state.semanticMemory[key] = next;
  return { key, ...next, rootMeanSquaredError: Math.sqrt(next.meanSquaredError) };
}

function recordEpisode(state, prediction, observation) {
  const episode = { episodeId: `episode:${observation.observationId}`,
    predictionId: prediction.predictionId, predictionVersion: prediction.version,
    observationId: observation.observationId, projectId: prediction.projectId,
    trajectoryId: prediction.trajectoryId, actionRef: prediction.actionRef,
    responsibleAgentId: prediction.responsibleAgentId, residual: observation.residual,
    predictionCommitment: prediction.commitment, signerFingerprint: observation.signerFingerprint,
    evidenceRefs: [...observation.evidenceRefs], observedAt: observation.observedAt };
  state.episodes[episode.episodeId] = episode;
  return episode;
}

function reviseAssumptions(state, prediction, observation) {
  const contradicted = Math.abs(observation.residual) > prediction.falsificationTolerance;
  if (!contradicted) return [];
  const independent = new Set(observation.independentRefs || []).size;
  const status = independent >= 2 ? 'INVALIDATED' : 'CHALLENGED';
  return prediction.assumptionIds.map((assumptionId) => {
    const revision = { assumptionId, status, predictionId: prediction.predictionId,
      observationId: observation.observationId, trajectoryId: prediction.trajectoryId,
      projectId: prediction.projectId, residual: observation.residual,
      criterion: prediction.falsificationTolerance, independentEvidenceCount: independent,
      evidenceRefs: [...observation.evidenceRefs] };
    state.assumptionLedger[assumptionId] = revision;
    return revision;
  });
}

function learn(state, prediction, observation) {
  memoryState(state);
  const episode = recordEpisode(state, prediction, observation);
  const semantic = updateSemantic(state, prediction, observation);
  const assumptionRevisions = reviseAssumptions(state, prediction, observation);
  return { episode, semantic, assumptionRevisions };
}

module.exports = { learn, memoryState, semanticKey, updateSemantic, recordEpisode, reviseAssumptions };
