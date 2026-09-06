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
  if (turns.length === 0) throw new Error('At least one trajectory turn is required for a golden path.');
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
  const source = originalTrajectory;
  if (!source || !source.id) throw new Error('A persisted trajectory id is required for counterfactual replay.');
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
    finalStatus: 'PENDING_VALIDATION'
  };

  return {
    replayId: `what-if-${Date.now()}`,
    timestamp: new Date().toISOString(),
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

const telemetry = require('./telemetryObserver');
const { embed } = require('./embeddingProvider');
const { textToVector } = require('./memoryScoring');
const crypto = require('crypto');

async function recordMissionTrajectory(db, options = {}) {
  if (!db) return null;
  const turns = Array.isArray(options.turns) ? options.turns : (options.trajectory || []);
  const goldenPath = cherryPickGoldenPath(turns);
  const trajId = options.id || `traj_${crypto.randomUUID()}`;
  const agentId = options.agentId || options.authorName || 'GenOS Agent';
  const task = options.task || options.mission || 'Autonomous Task';
  const report = options.report || {};
  const status = ['pending', 'active', 'rejected', 'revising'].includes(options.status) ? options.status : 'pending';
  const requestedConfidence = Number(options.confidence);
  const confidence = Number.isFinite(requestedConfidence) ? Math.max(0, Math.min(100, requestedConfidence)) : 0;

  const claimStatements = Array.isArray(report.claims)
    ? report.claims.map(c => c.statement || String(c)).join('; ')
    : '';
  const title = (report.claims?.[0]?.statement || task || 'Autonomous Trajectory').slice(0, 100);
  const semanticSummary = [
    `Task: ${task}`,
    `Outcome: ${report.outcome || 'success'}`,
    claimStatements ? `Claims: ${claimStatements}` : null,
    `Golden Path: ${goldenPath.goldenPathSteps.length} steps (${goldenPath.noiseReductionPercent}% noise reduction)`
  ].filter(Boolean).join(' | ');

  let vec = null;
  try {
    vec = await embed(`${title} ${semanticSummary}`);
  } catch (_) {}
  if (!vec || vec.length !== 768) {
    vec = textToVector(`${title} ${semanticSummary}`);
  }
  const float32 = new Float32Array(vec);
  const buffer = Buffer.from(float32.buffer);

  const classifiedTurns = turns.map(classifyTurn);
  const diffLinesJson = JSON.stringify(classifiedTurns.map(s => ({
    step: s.step,
    type: s.classification || s.type,
    action: s.action,
    detail: s.detail || s.cmd,
    error: s.error || null,
    pass: s.pass === true,
    success: s.success === true
  })));

  const workspaceId = String(options.workspaceId || '').trim();
  if (!workspaceId) throw new Error('workspaceId is required to record a trajectory.');
  const wsRow = await db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
  if (!wsRow) throw new Error(`Workspace '${workspaceId}' does not exist.`);

  await db.run(
    `INSERT INTO trajectories (
      id, workspace_id, author_id, author_name, title, status,
      semantic_summary, diff_file, diff_lines, confidence, embedding_blob
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    trajId,
    workspaceId,
    options.authorId || agentId,
    agentId,
    title,
    status,
    semanticSummary,
    options.diffFile || 'src/agent.ts',
    diffLinesJson,
    confidence,
    buffer
  );

  telemetry.emitEvent({
    eventType: 'TRAJECTORY_PERSISTED',
    agentId: agentId,
    action: 'RECORD_TRAJECTORY',
    detail: `Trajectory ${trajId} recorded: ${goldenPath.goldenPathSteps.length} golden steps (${goldenPath.noiseReductionPercent}% pruned).`,
    severity: 'info',
    payload: { trajectoryId: trajId, goldenPath, title, status }
  });

  return { trajectoryId: trajId, goldenPath, title, status, success: true };
}

module.exports = {
  SEED_TRAJECTORY,
  classifyTurn,
  cherryPickGoldenPath,
  counterfactualReplay,
  recordMissionTrajectory
};
