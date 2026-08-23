const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const agentCapsules = require('./src/services/agentCapsuleService');

async function run() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-capsule-bootstrap-'));
  const executable = path.resolve(__dirname, '../target/debug/genos');
  try {
    const capsule = await agentCapsules.provision({
      executable, workspaceRoot, agentId: 'agent-test', name: 'Capsule test', role: 'Verifier', budgetSteps: 12
    });
    assert.match(capsule.id, /^[0-9a-f-]+$/);
    assert.match(capsule.genomeId, /^[0-9a-f-]+$/);
    assert.equal(capsule.root, path.join(workspaceRoot, '.genos'));
    const inspected = spawnSync(executable, ['capsule', 'inspect', capsule.id, '--root', capsule.root], { encoding: 'utf8' });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).capsule_id, capsule.id);
    console.log('Agent capsule bootstrap checks passed.');
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
