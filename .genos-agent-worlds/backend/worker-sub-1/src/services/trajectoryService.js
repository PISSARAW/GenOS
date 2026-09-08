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

/**
 * Classifies an individual step in a mission trajectory
 * @param {object} turn
 * @returns {object}
 */
function classifyTurn(turn) {
  const isFailed = Boolean(
    turn.error ||
    turn.failed ||
    turn.success === false ||
    turn.status === 'error' ||
    turn.status === 'failed' ||
    turn.status === 'failure' ||
    (typeof turn.exitCode === 'number' && turn.exitCode !== 0) ||
    (typeof turn.code === 'number' && turn.code !== 0)
  );

  let category = turn.classification || turn.type;
  if (isFailed) {
    category = 'Dead-End';
  } else if (!category) {
    if (turn.cmd && (turn.pass || turn.success)) {
      category = 'Verification';
    } else if (turn.success && (turn.action?.includes('replace') || turn.action?.includes('patch') || turn.action?.includes('write') || turn.action === 'write_to_file')) {
      category = (turn.verified === true || turn.pass === true) ? 'Breakthrough' : 'Modification';
    } else {
      category = 'Exploration';
    }
  }
  return { ...turn, classification: category };
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

/**
 * Builds a counterfactual branch description from a persisted trajectory
 * @param {object} originalTrajectory
 * @param {number} stepIndex
 * @param {object} alterations
 * @returns {object}
 */
function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function counterfactualReplay(originalTrajectory = {}, stepIndex = 1, alterations = {}) {
  const source = (originalTrajectory && (originalTrajectory.id || originalTrajectory.turns)) ? originalTrajectory : {
    id: 'traj_default_simulation',
    turns: [
      { step: 1, action: 'init', success: true },
      { step: 2, action: 'process', error: 'fail' },
      { step: 3, action: 'finish', success: true }
    ],
    status: 'FAILURE'
  };
  const turns = source.turns || source.diffLines || [];
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('A persisted trajectory with recorded steps is required for counterfactual replay.');
  }

  const requestedStep = Number(stepIndex);
  if (!Number.isInteger(requestedStep) || requestedStep < 1 || requestedStep > turns.length) {
    throw new Error(`stepIndex must be an integer between 1 and ${turns.length}.`);
  }
  const step = requestedStep;
  const alt = alterations || {};
  const originalTimeline = {
    stepBranched: step,
    totalSteps: turns.length,
    steps: turns,
    finalStatus: source.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    sourceTrajectoryId: source.id || 'traj_default_simulation'
  };

  const branchIdx = step - 1;
  const replacedStep = turns[branchIdx] || {};
  const overrideStep = {
    ...replacedStep,
    type: 'Counterfactual Override',
    classification: alt.classification || 'Breakthrough',
    ...alt,
    step: replacedStep.step || step,
    counterfactual: true
  };
  const counterfactualSteps = [
    ...turns.slice(0, branchIdx),
    overrideStep,
    ...turns.slice(branchIdx + 1)
  ];

  const counterfactualTimeline = {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: counterfactualSteps.length,
    steps: counterfactualSteps,
    finalStatus: alt.error || alt.failed || alt.success === false ? 'FAILURE' : 'SUCCESS'
  };

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

const telemetry = require('./telemetryObserver');
const { embed } = require('./embeddingProvider');
const { textToVector } = require('./memoryScoring');
async function recordMissionTrajectory(db, options = {}) {
  if (!db) return null;
  let turns = Array.isArray(options.turns) ? options.turns : (options.trajectory || []);
  if (turns.length === 0) {
    turns = [{
      step: 1,
      action: 'mission_execution',
      classification: options.status === 'rejected' ? 'Dead-End' : 'Exploration',
      detail: options.task || 'Autonomous execution step',
      error: options.status === 'rejected' ? 'Mission execution failed or rejected' : null
    }];
  }
  const status = ['pending', 'active', 'approved', 'rejected', 'failed', 'error', 'revising', 'completed', 'success'].includes(options.status) ? options.status : 'pending';
  const goldenPath = cherryPickGoldenPath(turns, status);
  const trajId = options.id || `traj_${crypto.randomUUID()}`;
  const agentId = options.agentId || options.authorName || 'GenOS Agent';
  const task = options.task || options.mission || 'Autonomous Task';
  const report = options.report || {};
  const requestedConfidence = Number(options.confidence);
  const confidence = Number.isFinite(requestedConfidence) ? Math.max(0, Math.min(100, requestedConfidence)) : 0;

  const claimStatements = Array.isArray(report.claims)
    ? report.claims.map(c => c.statement || String(c)).join('; ')
    : '';
  const proofStatement = report.noAnswerProof?.method
    ? `Impossibility Proof (${report.noAnswerProof.method})`
    : '';
  const title = (report.claims?.[0]?.statement || proofStatement || task || 'Autonomous Trajectory').slice(0, 100);
  const semanticSummary = [
    `Task: ${task}`,
    `Outcome: ${report.outcome || status}`,
    claimStatements ? `Claims: ${claimStatements}` : null,
    proofStatement ? `Proof: ${proofStatement}` : null,
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

  let workspaceId = String(options.workspaceId || '').trim();
  if (!workspaceId) {
    const defaultWs = await db.get('SELECT id FROM workspaces ORDER BY rowid ASC LIMIT 1');
    workspaceId = defaultWs ? defaultWs.id : 'ws-genos-core';
  }
  let wsRow = await db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
  if (!wsRow) {
    const anyWs = await db.get('SELECT id FROM workspaces ORDER BY rowid ASC LIMIT 1');
    if (anyWs) {
      workspaceId = anyWs.id;
    } else {
      await db.run('INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)', workspaceId, 'Default Workspace', './');
    }
  }

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

  try {
    const fs = require('fs');
    const path = require('path');
    const trajDir = path.resolve('.genos/trajectories');
    if (!fs.existsSync(trajDir)) fs.mkdirSync(trajDir, { recursive: true });
    const trajFilePath = path.join(trajDir, `${agentId}.json`);
    const trajPayload = {
      id: trajId,
      agent_id: agentId,
      workspace_id: workspaceId,
      title,
      status,
      semantic_summary: semanticSummary,
      turns: classifiedTurns,
      golden_path: goldenPath,
      usage: options.usage || report.usage || {},
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(trajFilePath, JSON.stringify(trajPayload, null, 2), 'utf8');
  } catch (_) {}

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
