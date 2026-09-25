'use strict';

function taskIds(records) {
  return new Set(records.map((record) => record.taskId));
}

function assertDisjointTasks(training, holdout) {
  const trainingIds = taskIds(training);
  const overlap = holdout.filter((record) => trainingIds.has(record.taskId)).map((record) => record.taskId);
  if (overlap.length) throw new Error(`Training/holdout task leakage: ${[...new Set(overlap)].join(', ')}`);
}

function bestOutcome(outcomes) {
  const ranked = Object.entries(outcomes || {}).filter(([, score]) => Number.isFinite(score))
    .sort((left, right) => right[1] - left[1]);
  if (!ranked.length) throw new Error('Observed holdout outcomes are required.');
  return { topology: ranked[0][0], score: ranked[0][1] };
}

function evaluateSelection(input) {
  const training = input.training || [];
  const holdout = input.holdout || [];
  assertDisjointTasks(training, holdout);
  if (!holdout.length) throw new Error('At least one holdout task is required.');
  const predictions = new Map((input.predictions || []).map((prediction) => [prediction.taskId, prediction.topology]));
  const evaluated = holdout.map((record) => {
    const selected = predictions.get(record.taskId);
    if (!selected || !Number.isFinite(record.outcomes?.[selected])) throw new Error(`Missing selected-topology outcome for ${record.taskId}.`);
    const best = bestOutcome(record.outcomes);
    return { taskId: record.taskId, selectedTopology: selected, oracleTopology: best.topology,
      selectedOutcome: record.outcomes[selected], oracleOutcome: best.score,
      regret: best.score - record.outcomes[selected], exactOracleMatch: selected === best.topology };
  });
  return {
    trainingTaskCount: training.length,
    holdoutTaskCount: holdout.length,
    exactOracleMatches: evaluated.filter((record) => record.exactOracleMatch).length,
    exactOracleMatchRate: evaluated.filter((record) => record.exactOracleMatch).length / evaluated.length,
    meanUtilityRegret: evaluated.reduce((sum, record) => sum + record.regret, 0) / evaluated.length,
    holdout: evaluated
  };
}

module.exports = { assertDisjointTasks, evaluateSelection };
