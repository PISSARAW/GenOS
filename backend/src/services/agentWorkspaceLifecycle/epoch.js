const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { EPOCH_MARKER_FILENAME } = require('./constants');

function newEpochToken() {
  return crypto.randomUUID();
}

async function writeEpochMarker(workspaceRoot) {
  const token = newEpochToken();
  await fs.writeFile(path.join(workspaceRoot, EPOCH_MARKER_FILENAME), token);
  return token;
}

async function readEpochMarker(workspaceRoot) {
  try {
    const token = await fs.readFile(path.join(workspaceRoot, EPOCH_MARKER_FILENAME), 'utf8');
    return token.trim() || null;
  } catch (_) {
    return null;
  }
}

/**
 * Ownership marker for a capsule. Written when the workspace is created and
 * captured when cleanup is scheduled. A successor that reuses the same
 * deterministic path writes a fresh token, so a stale delayed cleanup detects
 * the mismatch instead of deleting the successor's capsule.
 */
async function ensureEpochMarker(workspaceRoot) {
  const existing = await readEpochMarker(workspaceRoot);
  if (existing) return existing;
  return writeEpochMarker(workspaceRoot);
}

function isProcessAlive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * True when the agent still owns a live runtime: either an in-memory child is
 * registered in the orchestration state or the durable agents row still points
 * at a live PID / running status.
 */
async function isAgentRuntimeAlive(agentId) {
  if (!agentId) return false;
  const { activeProcesses } = require('../agentOrchestrationState');
  if (activeProcesses.get(agentId)) return true;
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT runtime_pid, status FROM agents WHERE id = ?', agentId);
    if (!row) return false;
    if (isProcessAlive(row.runtime_pid)) return true;
    return row.status === 'running' || row.status === 'Active';
  } catch (_) {
    return false;
  }
}

module.exports = { newEpochToken, writeEpochMarker, readEpochMarker, ensureEpochMarker, isProcessAlive, isAgentRuntimeAlive };
