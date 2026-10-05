const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { provisionMissionWorkspace } = require('../src/services/agentRuntimeAdapter');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-orchestrator-workspace-'));
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = path.join(directory, 'capsules');
  const source = path.join(directory, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'mission.txt'), 'keep source untouched');

  try {
    const orchestrator = await provisionMissionWorkspace({ agentId: 'orchestrator-test', workspaceRoot: source }, 'orchestrator');
    assert.notEqual(orchestrator.workspaceRoot, source, 'an orchestrator must receive its own workspace');
    assert.equal(fs.readFileSync(path.join(orchestrator.workspaceRoot, 'mission.txt'), 'utf8'), 'keep source untouched');
    assert.equal(orchestrator.capsuleRoot, path.dirname(orchestrator.workspaceRoot));

    const worker = await provisionMissionWorkspace({ agentId: 'worker-test', workspaceRoot: orchestrator.workspaceRoot }, 'worker');
    assert.equal(worker.workspaceRoot, orchestrator.workspaceRoot, 'a worker keeps the workspace allocated by its orchestrator');

    const directRoot = path.join(directory, 'direct');
    fs.mkdirSync(directRoot);
    const direct = await provisionMissionWorkspace({
      agentId: 'direct-orchestrator', workspaceRoot: directRoot,
      workspaceProvisioned: true, capsuleRoot: directRoot
    }, 'orchestrator');
    assert.equal(direct.workspaceRoot, directRoot, 'a pre-provisioned mission keeps its requested workspace');
    assert.equal(direct.capsuleRoot, directRoot, 'direct mission capsules stay in the requested workspace');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
}

main().then(() => console.log('Orchestrator workspace provisioning checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
