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

async function provision(context = {}) {
  const ctx = context || {};
  const paths = capsuleGate.resolveCapsulePaths(ctx);
  const executable = capsuleGate.resolveExecutable(ctx.executable);
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
    return buildProvisionResult(JSON.parse(output), paths);
  } catch (error) {
    await fs.rm(paths.root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function snapshotOf(capsule) {
  if (capsule && capsule.agent_snapshot) return capsule.agent_snapshot;
  return {};
}

function buildProvisionResult(capsule, paths) {
  const snapshot = snapshotOf(capsule || {});
  const genome = snapshot.genome || {};
  return {
    id: capsule.capsule_id,
    agentId: snapshot.agent_id,
    genomeId: genome.id,
    snapshotId: snapshot.snapshot_id,
    branchId: capsule.branch_id,
    worldId: capsule.live_world_id,
    root: paths.root,
    genomePath: paths.genomePath,
    snapshotPath: paths.snapshotPath
  };
}

module.exports = { provision };
