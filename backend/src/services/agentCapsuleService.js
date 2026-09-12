const { spawn } = require('child_process');
const fs = require('fs/promises');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const capsuleGate = require('./agentCapsuleGate');

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      terminateChild(child);
      reject(new Error(`GenOS capsule bootstrap timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`GenOS capsule bootstrap failed (${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

const crypto = require('crypto');

async function readJsonSafe(filepath) {
  try {
    const raw = await fs.readFile(filepath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function provisionSynthetic(context = {}) {
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
    await fs.mkdir(paths.bootstrap, { recursive: true });
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
    await fs.rm(paths.root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function provision(context = {}) {
  const ctx = context || {};
  const paths = capsuleGate.resolveCapsulePaths(ctx);
  let executable;
  try {
    executable = capsuleGate.resolveExecutable(ctx.executable);
  } catch (err) {
    if (ctx.fallbackSynthetic) return provisionSynthetic(ctx);
    throw err;
  }
  const name = ctx.name || 'worker';
  const role = ctx.role || 'worker';
  const steps = String(ctx.budgetSteps || 100);
  try {
    await fs.mkdir(paths.bootstrap, { recursive: true });
    await run(executable, ['agent', 'create', '--name', name, '--role', role, '--out', paths.genomePath]);
    await run(executable, ['snapshot', 'create', '--agent', paths.genomePath, '--out', paths.snapshotPath]);
    const output = await run(executable, [
      'capsule', 'create', '--snapshot', paths.snapshotPath,
      '--seed', ctx.workspaceRoot,
      '--budget-steps', steps
    ]);
    return await buildProvisionResult(JSON.parse(output), paths);
  } catch (error) {
    await fs.rm(paths.root, { recursive: true, force: true }).catch(() => {});
    if (ctx.fallbackSynthetic) return provisionSynthetic(ctx);
    throw error;
  }
}

function snapshotOf(capsule) {
  if (capsule && capsule.agent_snapshot) return capsule.agent_snapshot;
  return {};
}

async function buildProvisionResult(capsule, paths) {
  let snapshot = snapshotOf(capsule || {});
  if (!snapshot.agent_id || !snapshot.genome) {
    const onDisk = await readJsonSafe(paths.snapshotPath);
    if (onDisk) snapshot = { ...onDisk, ...snapshot };
  }
  const genome = snapshot.genome || {};
  return {
    id: capsule.capsule_id || capsule.id,
    agentId: snapshot.agent_id || paths.agentId,
    genomeId: genome.id || genome.cell_id,
    snapshotId: snapshot.snapshot_id,
    branchId: capsule.branch_id || snapshot.branch_id,
    worldId: capsule.live_world_id || 'world-main',
    root: paths.root,
    genomePath: paths.genomePath,
    snapshotPath: paths.snapshotPath
  };
}

module.exports = { provision, provisionSynthetic };
