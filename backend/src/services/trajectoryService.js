/**
 * GenOS Cognitive Memory - Trajectory & Golden Path Service
 * Cherry-picking breakthrough trajectories and Counterfactual What-If replay
 */

const SEED_TRAJECTORY = Object.freeze({
  id: 'seed-trajectory-refactor',
  title: 'Parser refactor with guard clauses',
  status: 'SUCCESS',
  turns: Object.freeze([
    { type: 'Exploration', step: 1, action: 'view_file', detail: 'Inspected parser entry point.' },
    { type: 'Dead-End', step: 2, error: 'fail', detail: 'Recursive rewrite blew the stack budget.' },
    { type: 'Breakthrough', step: 3, success: true, action: 'replace_file_content', detail: 'Applied guard-clause patch.' }
  ])
});

/**
 * Classifies an individual step in a mission trajectory
 * @param {object} turn
 * @returns {object}
 */
function classifyTurn(turn) {
  let category = turn.classification || turn.type;
  if (!category) {
    if (turn.error || turn.failed) {
      category = 'Dead-End';
    } else if (turn.cmd && turn.pass) {
      category = 'Verification';
    } else if (turn.success && (turn.action?.includes('replace') || turn.action?.includes('patch'))) {
      category = 'Breakthrough';
    } else {
      category = 'Exploration';
    }
  } else if (turn.error || turn.failed) {
    category = 'Dead-End';
  }
  return { ...turn, classification: category };
}

/**
 * Cherry-picks breakthrough turns and synthesizes an optimal Golden-Path trajectory
 * @param {Array} rawTurns
 * @returns {object}
 */
function cherryPickGoldenPath(rawTurns = []) {
  const turns = Array.isArray(rawTurns) ? rawTurns : [];
  const classifiedSteps = turns.map(classifyTurn);
  const goldenPath = classifiedSteps.filter(s => s.classification !== 'Dead-End');
  const deadEndCount = turns.length - goldenPath.length;

  return {
    synthesisId: `golden-path-${Date.now()}`,
    originalStepCount: turns.length,
    prunedStepCount: deadEndCount,
    noiseReductionPercent: Number((((deadEndCount) / (turns.length || 1)) * 100).toFixed(1)),
    goldenPathSteps: goldenPath,
    classificationSummary: {
      exploration: classifiedSteps.filter(s => s.classification === 'Exploration').length,
      breakthrough: classifiedSteps.filter(s => s.classification === 'Breakthrough').length,
      deadEnd: deadEndCount,
      verification: classifiedSteps.filter(s => s.classification === 'Verification').length
    }
  };
}

/**
 * Builds a counterfactual branch description from a persisted trajectory
 * @param {object} originalTrajectory
 * @param {number} stepIndex
 * @param {object} alterations
 * @returns {object}
 */
function counterfactualReplay(originalTrajectory = {}, stepIndex = 2, alterations = {}) {
  const source = (originalTrajectory && (originalTrajectory.turns || originalTrajectory.diffLines))
    ? originalTrajectory
    : SEED_TRAJECTORY;
  const turns = source.turns || source.diffLines || [];
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('A persisted trajectory with recorded steps is required for counterfactual replay.');
  }

  const step = Math.min(Math.max(1, Number(stepIndex) || 1), turns.length);
  const alt = alterations || {};
  const originalTimeline = {
    stepBranched: step,
    totalSteps: turns.length,
    steps: turns,
    finalStatus: source.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    sourceTrajectoryId: source.id
  };

  const counterfactualTimeline = {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: turns.length,
    steps: [...turns.slice(0, step), { type: 'Counterfactual Override', ...alt }, ...turns.slice(step)],
    finalStatus: 'SUCCESS'
  };

  return {
    replayId: `what-if-${Date.now()}`,
    timestamp: new Date().toISOString(),
    branchingPoint: step,
    comparison: {
      mode: 'recorded-trajectory-branch',
      originalTimeline,
      counterfactualTimeline,
      outcome: 'Branch prepared from persisted steps; execution evidence is required before comparing results.'
    }
  };
}

module.exports = {
  SEED_TRAJECTORY,
  classifyTurn,
  cherryPickGoldenPath,
  counterfactualReplay
};
