const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');

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
  const capsuleRoot = context.capsuleRoot || path.dirname(context.workspaceRoot);
  const root = path.join(capsuleRoot, '.genos-runtime', context.agentId);
  const bootstrap = path.join(root, 'bootstrap', context.agentId);
  const genomePath = path.join(bootstrap, 'genome.json');
  const snapshotPath = path.join(bootstrap, 'snapshot.json');
  await fs.mkdir(bootstrap, { recursive: true });
  await run(context.executable, ['agent', 'create', '--name', context.name || 'worker', '--role', context.role || 'worker', '--out', genomePath]);
  await run(context.executable, ['snapshot', 'create', '--agent', genomePath, '--out', snapshotPath]);
  const output = await run(context.executable, [
    'capsule', 'create', '--snapshot', snapshotPath,
    '--seed', context.workspaceRoot,
    '--budget-steps', String(context.budgetSteps || 100)
  ]);
  const capsule = JSON.parse(output);
  return {
    id: capsule.capsule_id,
    agentId: capsule.agent_snapshot?.agent_id,
    genomeId: capsule.agent_snapshot?.genome?.id,
    snapshotId: capsule.agent_snapshot?.snapshot_id,
    branchId: capsule.branch_id,
    worldId: capsule.live_world_id,
    root,
    genomePath,
    snapshotPath
  };
}

module.exports = { provision };
