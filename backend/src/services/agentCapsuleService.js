const fs = require('fs/promises');
const capsuleGate = require('./agentCapsuleGate');
const capsuleBoundary = require('./capsuleProcessBoundary');
const securePaths = require('./trinityCapsulePaths');
const seals = require('./trinityCapsuleSeal');
const path = require('path');

const crypto = require('crypto');

async function readJsonSafe(filepath) {
  try {
    const raw = await fs.readFile(filepath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function provisionSyntheticRaw(context = {}) {
  const ctx = context || {};
  const paths = capsuleGate.resolveCapsulePaths(ctx);
  const name = ctx.name || 'worker';
  const role = ctx.role || 'worker';
  const agentId = paths.agentId;
  const capsuleId = crypto.randomUUID();
  const branchId = `branch-${crypto.randomBytes(4).toString('hex')}`;
  const snapshotId = `snap-${crypto.randomBytes(16).toString('hex')}`;
  const genomeId = crypto.randomUUID();
  try {
    securePaths.ensureDirectory(paths.bootstrap);
    const genomeData = {
      apiVersion: 'v0alpha1',
      bud_scars: 0,
      capabilities: ['inspect', 'reason', 'mutate'],
      cell_id: genomeId,
      id: genomeId,
      name,
      role,
      created_at: new Date().toISOString()
    };
    await fs.writeFile(paths.genomePath, JSON.stringify(genomeData, null, 2), 'utf8');
    const snapshotData = {
      agent_id: agentId,
      branch_id: branchId,
      created_at: new Date().toISOString(),
      snapshot_id: snapshotId,
      genome: genomeData
    };
    await fs.writeFile(paths.snapshotPath, JSON.stringify(snapshotData, null, 2), 'utf8');
    return {
      id: capsuleId,
      agentId,
      genomeId,
      snapshotId,
      branchId,
      worldId: 'world-main',
      root: paths.root,
      genomePath: paths.genomePath,
      snapshotPath: paths.snapshotPath
    };
  } catch (error) {
    await fs.rm(securePaths.assertPath(paths.root), { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function provisionRaw(context = {}) {
  const ctx = context || {};
  const paths = capsuleGate.resolveCapsulePaths(ctx);
  let executable;
  try {
    executable = capsuleGate.resolveExecutable(ctx.executable);
  } catch (err) {
    if (err.code === 'CAPSULE_EXECUTABLE_INVALID') throw err;
    if (ctx.correlation && ctx.fallbackSynthetic !== true) throw err;
    ctx.bootstrapMode = 'synthetic';
    ctx.fallbackReason = err.message;
    return provisionSyntheticRaw(ctx);
  }
  return provisionNative(ctx, paths, executable);
}

async function provisionNative(ctx, paths, executable) {
  const name = ctx.name || 'worker';
  const role = ctx.role || 'worker';
  const steps = String(ctx.budgetSteps || 100);
  try {
    securePaths.ensureDirectory(paths.bootstrap);
    await capsuleBoundary.run(executable, ['agent', 'create', '--name', name, '--role', role, '--out', paths.genomePath], { root: paths.root });
    await capsuleBoundary.run(executable, ['snapshot', 'create', '--agent', paths.genomePath, '--out', paths.snapshotPath], { root: paths.root });
    const output = await capsuleBoundary.run(executable, [
      'capsule', 'create', '--snapshot', paths.snapshotPath,
      '--seed', ctx.workspaceRoot,
      '--budget-steps', steps
    ], { root: paths.root });
    return await buildProvisionResult(JSON.parse(output), paths);
  } catch (error) {
    await fs.rm(securePaths.assertPath(paths.root), { recursive: true, force: true }).catch(() => {});
    if (ctx.correlation && ctx.fallbackSynthetic !== true) throw error;
    ctx.bootstrapMode = 'synthetic';
    ctx.fallbackReason = error.message;
    return provisionSyntheticRaw(ctx);
  }
}

async function snapshotOf(capsule, paths) {
  const snapshot = capsule?.agent_snapshot || {};
  if (snapshot.agent_id && snapshot.genome) return snapshot;
  const onDisk = await readJsonSafe(paths.snapshotPath);
  return onDisk ? { ...onDisk, ...snapshot } : snapshot;
}

function resultIds(capsule, snapshot, paths) {
  const genome = snapshot.genome || {};
  return {
    id: capsule.capsule_id || capsule.id,
    agentId: snapshot.agent_id || paths.agentId,
    genomeId: genome.id || genome.cell_id,
    snapshotId: snapshot.snapshot_id,
    branchId: capsule.branch_id || snapshot.branch_id,
  };
}

async function buildProvisionResult(capsule, paths) {
  const safeCapsule = capsule || {};
  const capsulePath = await verifyNativeCapsule(safeCapsule, paths);
  const snapshot = await snapshotOf(safeCapsule, paths);
  return {
    ...resultIds(safeCapsule, snapshot, paths),
    worldId: safeCapsule.live_world_id || 'world-main',
    root: paths.root,
    genomePath: paths.genomePath,
    snapshotPath: paths.snapshotPath,
    capsulePath
  };
}

async function verifyNativeCapsule(capsule, paths) {
  if (capsule.success !== true || capsule.verified !== true) throw new Error('Native capsule did not verify.');
  const id = capsuleGate.assertSafeAgentId(capsule.capsule_id);
  const capsulePath = securePaths.assertPath(path.join(paths.root, 'capsules', id + '.json'));
  const persisted = JSON.parse(await fs.readFile(capsulePath, 'utf8'));
  if (persisted.capsule_id !== id || persisted.hash !== capsule.hash) throw new Error('Native capsule persistence mismatch.');
  return capsulePath;
}

function provision(context = {}) {
  const ctx = { ...context };
  if (!ctx.correlation) return provisionRaw(ctx);
  return seals.provision(ctx, () => provisionRaw(ctx));
}

function provisionSynthetic(context = {}) {
  const ctx = { ...context, bootstrapMode: 'synthetic' };
  if (!ctx.correlation) return provisionSyntheticRaw(ctx);
  return seals.provision(ctx, () => provisionSyntheticRaw(ctx));
}

function recoverPartial(context = {}) {
  return require('./trinityCapsuleRecovery').recover(context);
}

module.exports = { provision, provisionSynthetic, recoverPartial };
