const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`GenOS capsule bootstrap failed (${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function provision(context = {}) {
  const root = path.join(context.workspaceRoot, '.genos');
  const bootstrap = path.join(root, 'bootstrap', context.agentId);
  const genomePath = path.join(bootstrap, 'genome.json');
  const snapshotPath = path.join(bootstrap, 'snapshot.json');
  await fs.mkdir(bootstrap, { recursive: true });
  await run(context.executable, ['agent', 'create', '--name', context.name, '--role', context.role, '--out', genomePath, '--format', 'json']);
  await run(context.executable, ['snapshot', 'create', '--agent', genomePath, '--out', snapshotPath, '--format', 'json']);
  const output = await run(context.executable, [
    'capsule', 'create', '--snapshot', snapshotPath, '--root', root,
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
