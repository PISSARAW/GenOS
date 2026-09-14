/**
 * Lot 1 (helpers) : exécution bornée de tests, vérification de domaine et
 * cryobiose durables pour les primitives fondamentales.
 */
const { spawn } = require('child_process');
const { getDatabase } = require('../../../db');
const { resolveContainedPath } = require('../../pathSafety');
const genosCli = require('../../genosCli');
const runtimeAdapter = require('../../agentRuntimeAdapter');
const { terminateChild } = require('../../processTermination');

async function scopedWorkspace(db, workspaceId) {
  return db.get('SELECT id, path FROM workspaces WHERE id = ?', workspaceId);
}

function runBoundedTestCommand(command, cwd, timeoutMs = 120000) {
  const normalized = normalizeSandboxCommand(command);
  if (!isAllowedSandboxTestCommand(normalized)) throw new Error('Test command is not allow-listed.');
  const windows = process.platform === 'win32';
  const shell = windows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
  const args = windows ? ['/d', '/s', '/c', normalized] : ['-c', normalized];
  return new Promise((resolve, reject) => {
    const child = spawn(shell, args, { cwd, detached: process.platform !== 'win32', windowsVerbatimArguments: windows, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateChild(child);
      const error = new Error(`Test command timed out after ${timeoutMs}ms.`);
      error.code = 'TEST_TIMEOUT';
      reject(error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-20000); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-20000); });
    child.once('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('close', (code, signal) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code, signal, stdout, stderr }); } });
  });
}

const { isAllowedSandboxTestCommand, normalizeSandboxCommand } = require('../../sandboxCommandPolicy');

function markFailure(state, message) {
  state.success = false;
  state.domainVerified = false;
  state.failures.push(message);
}

async function runTestVerification(context, state) {
  const db = await getDatabase();
  const workspace = await scopedWorkspace(db, context.workspaceId);
  if (!workspace) {
    markFailure(state, `Workspace not found: ${context.workspaceId}`);
    return;
  }
  try {
    const result = await runBoundedTestCommand(context.testCommand, workspace.path);
    state.testResults = { passed: result.code === 0, output: result.stdout || result.stderr, signal: result.signal };
    if (result.code !== 0) markFailure(state, `Test command failed: ${context.testCommand}`);
  } catch (err) {
    state.testResults = { passed: false, output: err.stdout || err.stderr || err.message };
    markFailure(state, `Test command failed: ${context.testCommand}`);
  }
}

async function verifyInvariants(context, state) {
  if (!Array.isArray(context.invariants)) return;
  if (!Array.isArray(context.invariantResults) || context.invariantResults.length !== context.invariants.length) {
    markFailure(state, 'Invariant results are required; invariants are never assumed to pass.');
    return;
  }
  state.invariantResults = context.invariants.map((invariant, index) => {
    const reported = context.invariantResults[index];
    return { invariant, passed: reported === true || (reported && reported.passed === true) };
  });
  if (state.invariantResults.some((result) => !result.passed)) markFailure(state, 'One or more invariants failed.');
}

async function verifyRequiredArtifacts(context, state) {
  if (!Array.isArray(context.requiredArtifacts) || !context.workspaceId) return;
  const fs = require('fs');
  const db = await getDatabase();
  const workspace = await scopedWorkspace(db, context.workspaceId);
  if (!workspace) return;
  for (const artifact of context.requiredArtifacts) {
    let fullPath;
    try { fullPath = resolveContainedPath(workspace.path, artifact, 'required artifact'); }
    catch (_) {
      markFailure(state, `Unsafe required artifact path: ${artifact}`);
      continue;
    }
    if (!fs.existsSync(fullPath)) markFailure(state, `Missing required artifact: ${artifact}`);
  }
}

async function verify(context) {
  const state = { success: true, domainVerified: true, testResults: null, invariantResults: [], failures: [] };
  if (context.testCommand && context.workspaceId) await runTestVerification(context, state);
  await verifyInvariants(context, state);
  await verifyRequiredArtifacts(context, state);
  return { success: state.success, domainVerified: state.domainVerified, testResults: state.testResults, invariantResults: state.invariantResults, failures: state.failures };
}

function freezeCapsuleValid(res, data, agentId) {
  return Boolean(res.ok && data && data.agent_id === agentId && typeof data.capsule_hash === 'string' && /^[a-f0-9]{64}$/i.test(data.capsule_hash));
}

async function persistFrozenCapsule(context) {
  const { db, agentId, agent, data, runtimeStopped } = context;
  const snapshotId = data.capsule_id || `${agentId}:${data.capsule_hash}`;
  await db.run(
    `INSERT INTO cryptobiosis_snapshots (snapshot_id, agent_id, workspace_id, capsule_hash, status, metadata_json)
     VALUES (?, ?, ?, ?, 'frozen', ?)`,
    snapshotId, agentId, agent.workspace_id || null, data.capsule_hash,
    JSON.stringify({ status: data.status, bunkerArmor: data.bunker_armor, runtimeStopped })
  );
  await db.run("UPDATE agents SET current_task = ?, runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", '[CRYPTOBIOSIS] Frozen capsule', agentId);
  return {
    success: true,
    cryptobiosis: data,
    agentId,
    bunkerArmor: data.bunker_armor,
    capsuleHash: data.capsule_hash,
    status: data.status || 'FROZEN_VITRIFIED',
    runtimeStopped,
    durable: true
  };
}

async function cryptobiosisFreeze(context) {
  const agentId = context.agentId || context.targetId;
  if (!agentId) return { success: false, error: 'agentId required for cryptobiosis freeze.' };
  const db = await getDatabase();
  const agent = await db.get('SELECT id, workspace_id, status FROM agents WHERE id = ?', agentId);
  if (!agent) return { success: false, error: `Agent '${agentId}' not found.` };
  const state = context.state || context.snapshot || { agentId, workspaceId: agent.workspace_id, frozenAt: Date.now() };
  const runtimeStopped = Boolean(await runtimeAdapter.stopMission(agentId));
  try {
    const res = await genosCli.runCryptobiosisFreeze(agentId, { state });
    const data = res.data;
    if (freezeCapsuleValid(res, data, agentId)) return persistFrozenCapsule({ db, agentId, agent, data, runtimeStopped });
    return { success: false, agentId, runtimeStopped, error: res.error || 'Cryptobiosis freeze returned an invalid capsule.' };
  } catch (error) {
    return { success: false, agentId, error: 'Cryptobiosis freeze failed: ' + error.message };
  }
}

function thawResponseValid(res, data, agentId) {
  return Boolean(res.ok && data && (data.agent_id === undefined || data.agent_id === agentId) && data.status === 'RESUSCITATED');
}

async function completeThaw(context) {
  const { db, agentId, snapshot, data } = context;
  await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP WHERE snapshot_id = ?", snapshot.snapshot_id);
  await db.run("UPDATE agents SET current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", '[CRYPTOBIOSIS] Resuscitated', agentId);
  return {
    success: true,
    thawed: data,
    agentId,
    hydrationLevel: data.hydration_level,
    status: data.status,
    snapshotId: snapshot.snapshot_id,
    durable: true
  };
}

async function cryptobiosisThaw(context) {
  const agentId = context.agentId || context.targetId;
  if (!agentId) return { success: false, error: 'agentId required' };
  const db = await getDatabase();
  const snapshot = await db.get("SELECT * FROM cryptobiosis_snapshots WHERE agent_id = ? AND status = 'frozen' ORDER BY frozen_at DESC LIMIT 1", agentId);
  if (!snapshot) return { success: false, agentId, error: 'No frozen durable capsule found for agent.' };
  await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawing' WHERE snapshot_id = ? AND status = 'frozen'", snapshot.snapshot_id);
  try {
    const res = await genosCli.runCryptobiosisThaw(agentId);
    const data = res.data;
    if (thawResponseValid(res, data, agentId)) return completeThaw({ db, agentId, snapshot, data });
    await db.run("UPDATE cryptobiosis_snapshots SET status = 'failed' WHERE snapshot_id = ?", snapshot.snapshot_id);
    return { success: false, agentId, snapshotId: snapshot.snapshot_id, error: res.error || 'Cryptobiosis thaw returned invalid identity or status.' };
  } catch (error) {
    await db.run("UPDATE cryptobiosis_snapshots SET status = 'failed' WHERE snapshot_id = ?", snapshot.snapshot_id).catch(() => {});
    return { success: false, agentId, error: 'Cryptobiosis thaw failed: ' + error.message };
  }
}

module.exports = { scopedWorkspace, runBoundedTestCommand, verify, cryptobiosisFreeze, cryptobiosisThaw };
