const crypto = require('crypto');
const telemetry = require('./telemetryObserver');
const { embed } = require('./embeddingProvider');
const { textToVector } = require('./memoryScoring');

const TRAJECTORY_STATUSES = [
  'pending', 'active', 'approved', 'rejected', 'failed',
  'error', 'revising', 'completed', 'success'
];

function buildDefaultTurn(options) {
  const rejected = options.status === 'rejected';
  return {
    step: 1,
    action: 'mission_execution',
    classification: rejected ? 'Dead-End' : 'Exploration',
    detail: options.task || 'Autonomous execution step',
    error: rejected ? 'Mission execution failed or rejected' : null
  };
}

function buildMissionTurns(options) {
  const turns = Array.isArray(options.turns) ? options.turns : (options.trajectory || []);
  if (turns.length !== 0) return turns;
  return [buildDefaultTurn(options)];
}

function normalizeStatus(status) {
  if (TRAJECTORY_STATUSES.includes(status)) return status;
  return 'pending';
}

function buildIdentity(options) {
  const trajId = options.id || `traj_${crypto.randomUUID()}`;
  const agentId = options.agentId || options.authorName || 'GenOS Agent';
  return { trajId, agentId };
}

function normalizeConfidence(raw) {
  const requested = Number(raw);
  if (Number.isFinite(requested)) return Math.max(0, Math.min(100, requested));
  return 0;
}

function buildClaimStatements(report) {
  if (!Array.isArray(report.claims)) return '';
  return report.claims.map(c => c.statement || String(c)).join('; ');
}

function buildProofStatement(report) {
  if (report.noAnswerProof && report.noAnswerProof.method) {
    return `Impossibility Proof (${report.noAnswerProof.method})`;
  }
  return '';
}

function getFirstClaim(report) {
  if (report.claims === null || report.claims === undefined) return undefined;
  const first = report.claims[0];
  if (first === null || first === undefined) return undefined;
  return first.statement;
}

function buildTitle(report, proofStatement, task) {
  const firstClaim = getFirstClaim(report);
  const value = firstClaim || proofStatement || task || 'Autonomous Trajectory';
  return value.slice(0, 100);
}

function buildSemanticSummary(context) {
  const lines = [
    `Task: ${context.task}`,
    `Outcome: ${context.outcome || context.status}`,
    context.claimStatements ? `Claims: ${context.claimStatements}` : null,
    context.proofStatement ? `Proof: ${context.proofStatement}` : null,
    `Golden Path: ${context.goldenPath.goldenPathSteps.length} steps (${context.goldenPath.noiseReductionPercent}% noise reduction)`
  ];
  return lines.filter(Boolean).join(' | ');
}

function buildSemanticContext(options, status, goldenPath) {
  const report = options.report || {};
  const task = options.task || options.mission || 'Autonomous Task';
  const claimStatements = buildClaimStatements(report);
  const proofStatement = buildProofStatement(report);
  const title = buildTitle(report, proofStatement, task);
  const semanticSummary = buildSemanticSummary({
    task,
    status,
    outcome: report.outcome,
    claimStatements,
    proofStatement,
    goldenPath
  });
  return { claimStatements, proofStatement, title, semanticSummary };
}

async function tryEmbed(text) {
  try {
    return await embed(text);
  } catch (_) {
    return null;
  }
}

async function computeEmbedding(text) {
  let vec = await tryEmbed(text);
  if (!vec || vec.length !== 768) vec = textToVector(text);
  return new Float32Array(vec);
}

function toDiffLine(step) {
  return {
    step: step.step,
    type: step.classification || step.type,
    action: step.action,
    detail: step.detail || step.cmd,
    error: step.error || null,
    pass: step.pass === true,
    success: step.success === true
  };
}

function buildDiffLinesJson(classifiedTurns) {
  return JSON.stringify(classifiedTurns.map(toDiffLine));
}

async function resolveWorkspaceId(db, options) {
  let workspaceId = String(options.workspaceId || '').trim();
  if (!workspaceId) {
    const defaultWs = await db.get('SELECT id FROM workspaces ORDER BY rowid ASC LIMIT 1');
    workspaceId = defaultWs ? defaultWs.id : 'ws-genos-core';
  }
  const wsRow = await db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
  if (!wsRow) {
    const anyWs = await db.get('SELECT id FROM workspaces ORDER BY rowid ASC LIMIT 1');
    if (anyWs) {
      workspaceId = anyWs.id;
    } else {
      await db.run('INSERT OR IGNORE INTO workspaces (id, name, path) VALUES (?, ?, ?)', workspaceId, 'Default Workspace', './');
    }
  }
  return workspaceId;
}

async function persistTrajectory(db, data) {
  await db.run(
    `INSERT INTO trajectories (
      id, workspace_id, author_id, author_name, title, status,
      semantic_summary, diff_file, diff_lines, confidence, embedding_blob
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.trajId,
    data.workspaceId,
    data.authorId,
    data.agentId,
    data.title,
    data.status,
    data.semanticSummary,
    data.diffFile,
    data.diffLinesJson,
    data.confidence,
    data.buffer
  );
}

function persistTrajectoryFile(data, options, report) {
  try {
    const fs = require('fs');
    const path = require('path');
    const trajDir = path.resolve('.genos/trajectories');
    if (!fs.existsSync(trajDir)) fs.mkdirSync(trajDir, { recursive: true });
    const trajFilePath = path.join(trajDir, `${data.agentId}.json`);
    const trajPayload = {
      id: data.trajId,
      agent_id: data.agentId,
      workspace_id: data.workspaceId,
      title: data.title,
      status: data.status,
      semantic_summary: data.semanticSummary,
      turns: data.classifiedTurns,
      golden_path: data.goldenPath,
      usage: options.usage || report.usage || {},
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(trajFilePath, JSON.stringify(trajPayload, null, 2), 'utf8');
  } catch (_) {}
}

function emitTrajectoryEvent(data) {
  telemetry.emitEvent({
    eventType: 'TRAJECTORY_PERSISTED',
    agentId: data.agentId,
    action: 'RECORD_TRAJECTORY',
    detail: `Trajectory ${data.trajId} recorded: ${data.goldenPath.goldenPathSteps.length} golden steps (${data.goldenPath.noiseReductionPercent}% pruned).`,
    severity: 'info',
    payload: { trajectoryId: data.trajId, goldenPath: data.goldenPath, title: data.title, status: data.status }
  });
}

module.exports = {
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
};
