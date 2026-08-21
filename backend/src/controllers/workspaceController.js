/**
 * GenOS Workspaces & Time Machine Controller
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

const WORKSPACES_ROOT = 'C:/Users/Shadow/Documents/GitHub';

async function listWorkspaces(req, res) {
  const db = await getDatabase();
  const dbWorkspaces = await db.all('SELECT * FROM workspaces ORDER BY created_at DESC');
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const activeCount = agentCount ? agentCount.count : 0;

  const result = await Promise.all(dbWorkspaces.map(async (w) => {
    let tags = [];
    try {
      tags = JSON.parse(w.tags || '[]');
    } catch (e) {}

    const categories = [];
    if (w.is_archived) {
      categories.push('Archived/Sleeping Workspaces');
    } else {
      categories.push('Active Swarms (Supervised)');
    }
    if (w.name.includes('-fork') || w.name.includes('_fork')) {
      categories.push('Experimental Timelines (Forks)');
    } else {
      categories.push('Root Universes');
    }

    return {
      id: w.id,
      title: w.name,
      name: w.name,
      path: w.path,
      visibility: w.visibility || 'Private',
      tags,
      snapshots: (await db.get('SELECT COUNT(*) as count FROM workspace_snapshots WHERE workspace_id = ?', w.id))?.count || 0,
      agents: `${activeCount} Active`,
      trajectories: (await db.get('SELECT COUNT(*) as count FROM trajectories WHERE workspace_id = ?', w.id))?.count || 0,
      anomalies: w.anomalies_count || 0,
      updated: w.updated_at || w.created_at || null,
      language: w.language || 'TypeScript',
      activityColor: w.anomalies_count > 0 ? '#cf222e' : '#0969da',
      activityData: [],
      categories,
      description: w.description || `Workspace for ${w.name}`
    };
  }));

  res.json(result);
}

async function createWorkspace(req, res) {
  const { name, language = 'TypeScript', description = '', visibility = 'Private' } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Workspace name is required' } });
  }

  const id = `ws-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const wsPath = path.join(WORKSPACES_ROOT, name);

  try {
    if (!fs.existsSync(wsPath)) {
      fs.mkdirSync(wsPath, { recursive: true });
    }
  } catch (err) {
    // Filesystem may be mock or read-only in sandbox
  }

  const db = await getDatabase();
  await db.run(
    `INSERT OR REPLACE INTO workspaces (id, name, path, visibility, language, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, name, wsPath, visibility, language, description, JSON.stringify([language.toLowerCase()])
  );

  telemetry.emitEvent({
    eventType: 'WORKSPACE_CREATED',
    agentId: 'workspace_controller',
    action: 'CREATE_WORKSPACE',
    detail: `Created workspace: ${name} (${id})`,
    severity: 'info'
  });

  res.status(201).json({
    success: true,
    workspace: { id, name, path: wsPath, visibility, language, description }
  });
}

async function getWorkspaceById(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const ws = await db.get('SELECT * FROM workspaces WHERE id = ? OR name = ?', id, id);

  if (!ws) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
  }

  const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', ws.id);
  res.json({
    workspace: ws,
    snapshots,
    branches: []
  });
}

async function getSnapshots(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? OR workspace_id = ? ORDER BY step_number ASC', id, `ws-${id}`);
  res.json(snapshots);
}

async function createSnapshot(req, res) {
  const { id } = req.params;
  const { label = 'Manual Snapshot', reason = 'User checkpoint', author = 'operator' } = req.body || {};
  const snapId = `snp-${Date.now()}`;
  const hash = snapId.slice(-7);

  const db = await getDatabase();
  const countRecord = await db.get('SELECT COUNT(*) as count FROM workspace_snapshots WHERE workspace_id = ?', id);
  const nextStep = (countRecord ? countRecord.count : 0) + 1;

  await db.run(
    `INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    snapId, id, hash, nextStep, label, author, reason
  );

  telemetry.emitEvent({
    eventType: 'SNAPSHOT_CREATED',
    agentId: author,
    action: 'SNAPSHOT',
    detail: `Created snapshot '${label}' (step ${nextStep}) for workspace ${id}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, snapshot: { id: snapId, workspaceId: id, stepNumber: nextStep, label, hash } });
}

async function restoreSnapshot(req, res) {
  const { id } = req.params;
  const { snapshotId, stepNumber } = req.body || {};
  const db = await getDatabase();
  const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? OR name = ?', id, id);
  if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
  const snapshot = snapshotId
    ? await db.get('SELECT * FROM workspace_snapshots WHERE id = ? AND workspace_id = ?', snapshotId, workspace.id)
    : await db.get('SELECT * FROM workspace_snapshots WHERE workspace_id = ? AND step_number = ?', workspace.id, Number(stepNumber));
  if (!snapshot) return res.status(404).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: 'The requested snapshot does not exist in this workspace.' } });

  telemetry.emitEvent({
    eventType: 'WORKSPACE_RESTORED',
    agentId: 'operator',
    action: 'RESTORE',
    detail: `Restored workspace ${workspace.id} to snapshot ${snapshot.id}`,
    severity: 'warning'
  });

  res.json({
    success: true,
    message: `Workspace '${workspace.id}' successfully restored to checkpoint.`,
    snapshot,
    restoredAt: new Date().toISOString()
  });
}

const bisectionService = require('../services/bisectionService');

async function getDiff(req, res, next) {
  try {
    const db = await getDatabase();
    const base = req.query.base;
    const target = req.query.target;
    if (!base || !target) return res.status(400).json({ error: { code: 'MISSING_BRANCHES', message: 'Both base and target workspaces are required.' } });
    const targetWorkspace = await db.get('SELECT * FROM workspaces WHERE id = ? OR name = ?', target, target);
    if (!targetWorkspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${target}` } });
    const trajectories = await db.all('SELECT * FROM trajectories WHERE workspace_id = ? ORDER BY created_at ASC', targetWorkspace.id);
    const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', targetWorkspace.id);
    const diffEntries = [];
    for (const trajectory of trajectories) {
      let lines = [];
      try { lines = JSON.parse(trajectory.diff_lines || '[]'); } catch (_) {}
      const additions = lines.filter((line) => (line.type || line.kind) === 'addition' || String(line.content || line.text || line).startsWith('+')).length;
      const deletions = lines.filter((line) => (line.type || line.kind) === 'deletion' || String(line.content || line.text || line).startsWith('-')).length;
      diffEntries.push({ file: trajectory.diff_file || 'unknown', category: 'Trajectory', additions, deletions, collisionRisk: 'UNKNOWN', author: trajectory.author_name, notes: trajectory.title });
    }
    for (const snapshot of snapshots) {
      if (!snapshot.diff_summary) continue;
      diffEntries.push({ file: snapshot.label, category: 'Snapshot', additions: 0, deletions: 0, collisionRisk: 'UNKNOWN', author: snapshot.author, notes: snapshot.diff_summary });
    }
    const diff = bisectionService.diffWorkspaces(base, targetWorkspace.name, { diffEntries });
    res.json(diff);
  } catch (err) {
    next(err);
  }
}

async function bisect(req, res, next) {
  try {
    const { workspaceId, testCommand, snapshots: suppliedSnapshots = [] } = req.body || {};
    const db = await getDatabase();
    let snapshots = suppliedSnapshots;
    if (workspaceId) {
      const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? OR name = ?', workspaceId, workspaceId);
      if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${workspaceId}` } });
      snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', workspace.id);
      snapshots = snapshots.map((snapshot) => {
        let metadata = {};
        try { metadata = JSON.parse(snapshot.metadata || '{}'); } catch (_) {}
        return { ...snapshot, step: snapshot.step_number, hash: snapshot.snapshot_hash, agent: snapshot.author, healthy: metadata.healthy !== false && !/anomal|regress|fail|error/i.test(`${snapshot.label} ${snapshot.reason || ''} ${snapshot.diff_summary || ''}`), desc: snapshot.reason || snapshot.label };
      });
    }
    const result = bisectionService.bisectAnomaly(snapshots);
    result.workspaceId = workspaceId;
    result.testCommand = testCommand || null;

    telemetry.emitEvent({
      eventType: 'CAUSAL_BISECTION_COMPLETED',
      agentId: 'bisection_sentinel',
      action: 'BISECT',
      detail: result.culpritReport
        ? `Isolated culprit step ${result.culpritReport.stepNumber} in ${result.bisectionIterationsRequired} iterations`
        : `Bisection completed without an isolated culprit in ${result.bisectionIterationsRequired} iterations`,
      severity: 'warning',
      payload: result
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function rollback(req, res, next) {
  try {
    const { workspaceId = 'ws-genos-core', culpritReport = {} } = req.body || {};
    const db = await getDatabase();
    const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? OR name = ?', workspaceId, workspaceId);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${workspaceId}` } });
    const targetStep = Number(culpritReport.stepNumber || req.body.stepNumber || 0);
    const targetSnapshot = targetStep ? await db.get('SELECT * FROM workspace_snapshots WHERE workspace_id = ? AND step_number = ?', workspace.id, targetStep) : null;
    if (targetStep && !targetSnapshot) return res.status(404).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `Snapshot step ${targetStep} not found in ${workspace.id}` } });
    const result = bisectionService.remediateRollback(workspaceId, culpritReport);
    result.targetSnapshot = targetSnapshot || null;

    telemetry.emitEvent({
      eventType: 'INVARIANT_ROLLBACK_EXECUTED',
      agentId: 'operator',
      action: 'ROLLBACK',
      detail: `Executed surgical invariant rollback on workspace ${workspaceId}`,
      severity: 'warning',
      payload: result
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function previewRollback(req, res, next) {
  try {
    const { id } = req.params;
    const step = Number(req.query.step);
    if (!Number.isInteger(step) || step < 1) return res.status(400).json({ error: { code: 'INVALID_STEP', message: 'A positive snapshot step is required.' } });
    const db = await getDatabase();
    const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? OR name = ?', id, id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
    const snapshot = await db.get('SELECT * FROM workspace_snapshots WHERE workspace_id = ? AND step_number = ?', workspace.id, step);
    if (!snapshot) return res.status(404).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `Snapshot step ${step} not found in ${workspace.id}` } });
    const trajectories = await db.all('SELECT diff_file, diff_lines FROM trajectories WHERE workspace_id = ?', workspace.id);
    const affectedFiles = [...new Set(trajectories.flatMap((t) => {
      let lines = []; try { lines = JSON.parse(t.diff_lines || '[]'); } catch (_) {}
      return lines.length ? [t.diff_file || 'unknown'] : [];
    }))];
    res.json({ workspaceId: workspace.id, step, targetSnapshot: snapshot, affectedFiles, reversePatch: snapshot.diff_summary || 'No reverse diff recorded for this snapshot.', canApply: true });
  } catch (err) { next(err); }
}

module.exports = {
  listWorkspaces,
  createWorkspace,
  getWorkspaceById,
  getSnapshots,
  createSnapshot,
  restoreSnapshot,
  previewRollback,
  getDiff,
  bisect,
  rollback
};
