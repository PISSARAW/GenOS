/**
 * GenOS Cognitive Memory - Trajectory & Golden Path Service
 * Cherry-picking breakthrough trajectories and Counterfactual What-If replay
 */

const crypto = require('crypto');

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

function isFailureStatus(status) {
  if (status === 'error' || status === 'failed' || status === 'failure') return true;
  return false;
}

function isNonZeroCode(turn) {
  if (typeof turn.exitCode === 'number' && turn.exitCode !== 0) return true;
  if (typeof turn.code === 'number' && turn.code !== 0) return true;
  return false;
}

function isFailedTurn(turn) {
  if (turn.error || turn.failed || turn.success === false) return true;
  if (isFailureStatus(turn.status)) return true;
  return isNonZeroCode(turn);
}

function isWriteAction(action) {
  if (action === null || action === undefined) return false;
  if (action.includes('replace') || action.includes('patch') || action.includes('write')) return true;
  return action === 'write_to_file';
}

function isModificationTurn(turn) {
  if (!turn.success) return false;
  return isWriteAction(turn.action);
}

function isVerified(turn) {
  if (turn.verified === true) return true;
  return turn.pass === true;
}

function inferCategory(turn) {
  if (turn.cmd && (turn.pass || turn.success)) return 'Verification';
  if (isModificationTurn(turn)) return isVerified(turn) ? 'Breakthrough' : 'Modification';
  return 'Exploration';
}

/**
 * Classifies an individual step in a mission trajectory
 * @param {object} turn
 * @returns {object}
 */
function classifyTurn(turn) {
  if (isFailedTurn(turn)) return { ...turn, classification: 'Dead-End' };
  const category = turn.classification || turn.type;
  if (category) return { ...turn, classification: category };
  return { ...turn, classification: inferCategory(turn) };
}

/**
 * Cherry-picks breakthrough turns and synthesizes an optimal Golden-Path trajectory
 * @param {Array} rawTurns
 * @returns {object}
 */
function cherryPickGoldenPath(rawTurns = [], globalStatus = 'success') {
  const turns = Array.isArray(rawTurns) ? rawTurns : [];
  if (turns.length === 0) throw new Error('At least one trajectory turn is required for a golden path.');
  const classifiedSteps = turns.map(classifyTurn);

  const isFailed = ['rejected', 'failed', 'error', 'FAILURE'].includes(globalStatus);
  const goldenPath = isFailed ? [] : classifiedSteps.filter(s => s.classification !== 'Dead-End');
  const deadEndSteps = classifiedSteps.filter(s => s.classification === 'Dead-End');
  const deadEndCount = deadEndSteps.length;
  const allPruned = isFailed || (turns.length > 0 && goldenPath.length === 0);

  return {
    synthesisId: `golden-path-${Date.now()}`,
    validGoldenPath: !isFailed && !allPruned,
    originalStepCount: turns.length,
    prunedStepCount: deadEndCount,
    noiseReductionPercent: Number((((deadEndCount) / (turns.length || 1)) * 100).toFixed(1)),
    goldenPathSteps: goldenPath,
    goldenPath: goldenPath,
    deadEndSteps,
    prunedSteps: deadEndSteps,
    allPruned,
    warning: allPruned ? 'All trajectory turns were pruned as dead-ends; no golden path steps synthesized.' : null,
    classificationSummary: {
      exploration: classifiedSteps.filter(s => s.classification === 'Exploration').length,
      breakthrough: classifiedSteps.filter(s => s.classification === 'Breakthrough').length,
      deadEnd: deadEndCount,
      verification: classifiedSteps.filter(s => s.classification === 'Verification').length
    }
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveSource(originalTrajectory) {
  if (originalTrajectory && typeof originalTrajectory === 'object') return originalTrajectory;
  return {};
}

function requirePersistedSource(source) {
  if (source.id || source.turns || source.diffLines || source.diff_lines) return;
  throw new Error('A persisted trajectory object is required for counterfactual replay.');
}

function decodeStringTurns(turns) {
  try {
    return JSON.parse(turns);
  } catch (_) {
    return [];
  }
}

function shouldDecodeMsgpack(turns, source) {
  if (Buffer.isBuffer(turns)) return true;
  if (!source.diff_lines_msgpack) return false;
  if (!Array.isArray(turns)) return true;
  return turns.length === 0;
}

function decodeMsgpackTurns(turns, source) {
  try {
    const { unpack } = require('msgpackr');
    const payload = Buffer.isBuffer(turns) ? turns : source.diff_lines_msgpack;
    return unpack(payload);
  } catch (_) {
    return turns;
  }
}

function resolveTurns(source) {
  let turns = source.turns || source.diffLines || source.diff_lines || [];
  if (typeof turns === 'string') {
    turns = decodeStringTurns(turns);
  } else if (shouldDecodeMsgpack(turns, source)) {
    turns = decodeMsgpackTurns(turns, source);
  }
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('A persisted trajectory with recorded steps is required for counterfactual replay.');
  }
  return turns;
}

function resolveStep(stepIndex, totalSteps) {
  const requestedStep = Number(stepIndex);
  if (Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= totalSteps) {
    return requestedStep;
  }
  throw new Error(`stepIndex must be an integer between 1 and ${totalSteps}.`);
}

function buildOriginalTimeline(source, turns, step) {
  return {
    stepBranched: step,
    totalSteps: turns.length,
    steps: turns,
    finalStatus: source.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    sourceTrajectoryId: source.id || 'traj_default_simulation'
  };
}

function buildOverrideStep(replacedStep, step, alt) {
  return {
    ...replacedStep,
    type: 'Counterfactual Override',
    classification: alt.classification || 'Breakthrough',
    ...alt,
    step: replacedStep.step || step,
    counterfactual: true
  };
}

function buildCounterfactualTimeline(step, alt, steps) {
  return {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: steps.length,
    steps,
    finalStatus: alt.error || alt.failed || alt.success === false ? 'FAILURE' : 'SUCCESS'
  };
}

/**
 * Builds a counterfactual branch description from a persisted trajectory
 * @param {object} originalTrajectory
 * @param {number} stepIndex
 * @param {object} alterations
 * @returns {object}
 */
function counterfactualReplay(originalTrajectory = {}, stepIndex = 1, alterations = {}) {
  const source = resolveSource(originalTrajectory);
  requirePersistedSource(source);
  const turns = resolveTurns(source);
  const step = resolveStep(stepIndex, turns.length);
  const alt = alterations || {};
  const originalTimeline = buildOriginalTimeline(source, turns, step);

  const branchIdx = step - 1;
  const replacedStep = turns[branchIdx] || {};
  const overrideStep = buildOverrideStep(replacedStep, step, alt);
  const counterfactualSteps = [
    ...turns.slice(0, branchIdx),
    overrideStep,
    ...turns.slice(branchIdx + 1)
  ];
  const counterfactualTimeline = buildCounterfactualTimeline(step, alt, counterfactualSteps);

  const replayFingerprint = crypto.createHash('sha256')
    .update(stableSerialize({ sourceTrajectoryId: source.id || 'traj_default_simulation', step, alterations: alt, steps: counterfactualSteps }))
    .digest('hex');

  return {
    replayId: `what-if-${replayFingerprint.slice(0, 24)}`,
    timestamp: source.created_at || null,
    replayFingerprint,
    branchingPoint: step,
    comparison: {
      mode: 'recorded-trajectory-branch',
      originalTimeline,
      counterfactualTimeline,
      outcome: 'INCONCLUSIVE_PENDING_EXECUTION',
      validationRequired: true
    }
  };
}

const {
  buildMissionTurns,
  normalizeStatus,
  buildIdentity,
  normalizeConfidence,
  buildSemanticContext,
  computeEmbedding,
  buildDiffLinesJson,
  resolveWorkspaceId,
  persistTrajectory,
  persistTrajectoryFile,
  emitTrajectoryEvent
} = require('./trajectoryServiceHelpers');

async function recordMissionTrajectory(db, options = {}) {
  if (!db) return null;
  const turns = buildMissionTurns(options);
  const status = normalizeStatus(options.status);
  const goldenPath = cherryPickGoldenPath(turns, status);
  const identity = buildIdentity(options);
  const report = options.report || {};
  const confidence = normalizeConfidence(options.confidence);
  const context = buildSemanticContext(options, status, goldenPath);

  const float32 = await computeEmbedding(`${context.title} ${context.semanticSummary}`);
  const buffer = Buffer.from(float32.buffer);
  const classifiedTurns = turns.map(classifyTurn);
  const diffLinesJson = buildDiffLinesJson(classifiedTurns);
  const workspaceId = await resolveWorkspaceId(db, options);

  const data = {
    trajId: identity.trajId,
    agentId: identity.agentId,
    authorId: options.authorId || identity.agentId,
    workspaceId,
    title: context.title,
    status,
    semanticSummary: context.semanticSummary,
    diffFile: options.diffFile || 'src/agent.ts',
    diffLinesJson,
    confidence,
    buffer,
    report,
    classifiedTurns,
    goldenPath
  };

  await persistTrajectory(db, data);
  persistTrajectoryFile(data, options, report);
  emitTrajectoryEvent(data);

  return { trajectoryId: data.trajId, goldenPath, title: data.title, status, success: true };
}

module.exports = {
  SEED_TRAJECTORY,
  classifyTurn,
  cherryPickGoldenPath,
  counterfactualReplay,
  recordMissionTrajectory
};
