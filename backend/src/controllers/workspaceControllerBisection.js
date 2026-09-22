'use strict';

/**
 * @file workspaceControllerBisection.js
 * @description Bisection and rollback operations for workspaces
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db');
const bisectionService = require('../services/bisectionService');
const { MAX_BISECTION_SNAPSHOTS } = bisectionService;
const snapshotStore = require('../services/workspaceSnapshotStore');
const telemetry = require('../services/telemetryObserver');
const { findWorkspace } = require('./workspaceControllerFiles');

function buildScope(req) {
  return req.tenant
    ? { clause: 'organization_id = ? AND project_id = ?', params: [req.tenant.organizationId, req.tenant.projectId] }
    : { clause: 'organization_id IS NULL AND project_id IS NULL', params: [] };
}

async function getBaseWorkspace(db, base, scope) {
  return await db.get(`SELECT * FROM workspaces WHERE ${scope.clause} AND (id = ? OR name = ?)`, ...scope.params, base, base);
}

async function getSnapshotsForComparison(db, baseWorkspace, targetWorkspace) {
  const sameWorkspace = baseWorkspace.id === targetWorkspace.id;
  const [baseSnapshot, targetSnapshot] = await Promise.all([
    db.get(`SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? ORDER BY s.step_number ${sameWorkspace ? 'ASC' : 'DESC'} LIMIT 1`, baseWorkspace.id),
    db.get('SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? ORDER BY s.step_number DESC LIMIT 1', targetWorkspace.id)
  ]);
  return { baseSnapshot, targetSnapshot };
}

async function buildManifestDiff(db, baseSnapshot, targetSnapshot) {
  const [baseManifest, targetManifest] = await Promise.all([
    snapshotStore.readManifest(baseSnapshot),
    snapshotStore.readManifest(targetSnapshot)
  ]);
  const baseFiles = new Map(baseManifest.files.map((file) => [file.path, file]));
  const targetFiles = new Map(targetManifest.files.map((file) => [file.path, file]));
  const files = [...new Set([...baseFiles.keys(), ...targetFiles.keys()])].sort();
  return files
    .filter((file) => baseFiles.get(file)?.hash !== targetFiles.get(file)?.hash)
    .map((file) => ({
      file,
      additions: targetFiles.has(file) && !baseFiles.has(file) ? 1 : 0,
      deletions: baseFiles.has(file) && !targetFiles.has(file) ? 1 : 0,
      category: 'Snapshot manifest',
      collisionRisk: 'UNKNOWN'
    }));
}

function countAdditions(lines) {
  return lines.filter((line) => isAddition(line)).length;
}

function countDeletions(lines) {
  return lines.filter((line) => isDeletion(line)).length;
}

function isAddition(line) {
  return (line.type || line.kind) === 'addition' || String(line.content || line.text || line).startsWith('+');
}

function isDeletion(line) {
  return (line.type || line.kind) === 'deletion' || String(line.content || line.text || line).startsWith('-');
}

function parseTrajectoryLines(trajectory) {
  try { return JSON.parse(trajectory.diff_lines || '[]'); } catch (_) { return []; }
}

function buildTrajectoryDiffEntry(trajectory) {
  const lines = parseTrajectoryLines(trajectory);
  const additions = countAdditions(lines);
  const deletions = countDeletions(lines);
  return { file: trajectory.diff_file || 'unknown', category: 'Trajectory', additions, deletions, collisionRisk: 'UNKNOWN', author: trajectory.author_name, notes: trajectory.title };
}

function buildSnapshotDiffEntry(snapshot) {
  if (!snapshot.diff_summary) return null;
  return { file: snapshot.label, category: 'Snapshot', additions: 0, deletions: 0, collisionRisk: 'UNKNOWN', author: snapshot.author, notes: snapshot.diff_summary };
}

async function buildTrajectoryDiff(db, targetWorkspace) {
  const trajectories = await db.all('SELECT * FROM trajectories WHERE workspace_id = ? ORDER BY created_at ASC', targetWorkspace.id);
  const snapshots = await db.all('SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC', targetWorkspace.id);
  const diffEntries = trajectories.map(buildTrajectoryDiffEntry);
  for (const snapshot of snapshots) {
    const entry = buildSnapshotDiffEntry(snapshot);
    if (entry) diffEntries.push(entry);
  }
  return diffEntries;
}

async function getDiff(req, res, next) {
  try {
    const db = await getDatabase();
    const base = req.query.base;
    const target = req.query.target;
    if (!base || !target) return res.status(400).json({ error: { code: 'MISSING_BRANCHES', message: 'Both base and target workspaces are required.' } });
    const scope = buildScope(req);
    const baseWorkspace = await getBaseWorkspace(db, base, scope);
    const targetWorkspace = await findWorkspace(db, req, target);
    if (!targetWorkspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${target}` } });
    if (baseWorkspace) {
      const { baseSnapshot, targetSnapshot } = await getSnapshotsForComparison(db, baseWorkspace, targetWorkspace);
      if (baseSnapshot && targetSnapshot) {
        const manifestDiff = await buildManifestDiff(db, baseSnapshot, targetSnapshot);
        return res.json(bisectionService.diffWorkspaces(baseWorkspace.name, targetWorkspace.name, { diffEntries: manifestDiff }));
      }
    }
    const diffEntries = await buildTrajectoryDiff(db, targetWorkspace);
    const diff = bisectionService.diffWorkspaces(base, targetWorkspace.name, { diffEntries });
    res.json(diff);
  } catch (err) {
    next(err);
  }
}

function validateBisectInput(workspaceId, testCommand) {
  if (!workspaceId || !String(testCommand || '').trim()) {
    return { error: { code: 'BISECTION_INPUT_REQUIRED', message: 'workspaceId and testCommand are required.' } };
  }
  return null;
}

function validateTestCommand(testCommand) {
  if (!snapshotStore.isAllowedTestCommand(testCommand)) {
    return { error: { code: 'TEST_COMMAND_NOT_ALLOWED', message: 'testCommand must be one of the allow-listed test commands (npm test, npm run check, pytest, cargo test).' } };
  }
  return null;
}

function filterDurableSnapshots(rows) {
  return rows.filter((row) => {
    try {
      const metadata = JSON.parse(row.metadata || '{}');
      return metadata.storage === 'durable-filesystem' && metadata.manifestPath && fs.existsSync(metadata.manifestPath);
    } catch (_) {
      return false;
    }
  });
}

async function bisect(req, res, next) {
  try {
    const { workspaceId, testCommand, timeoutMs } = req.body || {};
    const inputError = validateBisectInput(workspaceId, testCommand);
    if (inputError) return res.status(400).json(inputError);
    const testCmdError = validateTestCommand(testCommand);
    if (testCmdError) return res.status(400).json(testCmdError);
    const normalizedCommand = String(testCommand).trim().replace(/\s+/g, ' ');
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, workspaceId);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${workspaceId}` } });
    const rows = await db.all(
      'SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? ORDER BY s.step_number ASC LIMIT ?',
      workspace.id,
      MAX_BISECTION_SNAPSHOTS + 1
    );
    if (rows.length > MAX_BISECTION_SNAPSHOTS) {
      return res.status(413).json({ error: { code: 'BISECTION_HISTORY_TOO_LARGE', message: `Snapshot history exceeds the ${MAX_BISECTION_SNAPSHOTS}-snapshot bisection limit.` } });
    }
    const history = filterDurableSnapshots(rows);
    if (history.length < 2) return res.status(409).json({ error: { code: 'NO_DURABLE_SNAPSHOTS', message: 'Capture at least two durable snapshots before running bisection.' } });
    const result = await bisectionService.autoBisectWorkspaceAnomaly(db, {
      workspaceId: workspace.id,
      workspaceRoot: workspace.path,
      testCommand: normalizedCommand,
      snapshotHistory: history,
      timeoutMs: Math.min(Number(timeoutMs) || 30000, 120000),
      autoRollback: false
    });
    telemetry.emitEvent({ eventType: 'WORKSPACE_BISECTION_COMPLETED', agentId: req.user?.username || 'studio', action: 'BISECTION', detail: `Bisection completed for ${workspace.id}`, payload: { workspaceId: workspace.id, command: normalizedCommand, result } });
    res.json(result);
  } catch (error) { next(error); }
}

async function rollback(req, res, next) {
  try {
    const { workspaceId, step, stepNumber, snapshotId } = req.body || {};
    const id = workspaceId || req.params.id;
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${id}` } });
    const reference = snapshotId ?? stepNumber ?? step;
    if (reference == null) return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'A snapshot step or id is required.' } });
    const result = await snapshotStore.restore({ db, workspace, reference, author: req.user?.username || 'studio' });
    telemetry.emitEvent({ eventType: 'WORKSPACE_ROLLBACK_COMPLETED', agentId: req.user?.username || 'studio', action: 'ROLLBACK', detail: `Rolled back ${workspace.id} to ${result.restoredSnapshot.id}`, payload: { workspaceId: workspace.id, snapshotId: result.restoredSnapshot.id, safetySnapshotId: result.safetySnapshot.id, strategy: result.strategy } });
    res.json({ ...result, rollback: true });
  } catch (error) { next(error); }
}

async function previewRollback(req, res, next) {
  try {
    const db = await getDatabase();
    const workspace = await findWorkspace(db, req, req.params.id);
    if (!workspace) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Workspace not found: ${req.params.id}` } });
    const reference = req.query.step ?? req.query.stepNumber ?? req.query.snapshotId;
    if (reference == null) return res.status(400).json({ error: { code: 'SNAPSHOT_REQUIRED', message: 'A snapshot step or id is required.' } });
    res.json(await snapshotStore.preview({ db, workspace, reference }));
  } catch (error) { next(error); }
}

module.exports = { getDiff, bisect, rollback, previewRollback };