const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const agentCapsules = require('./src/services/agentCapsuleService');

async function run() {
  const capsuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-capsule-bootstrap-'));
  const workspaceRoot = path.join(capsuleRoot, 'workspace');
  fs.mkdirSync(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, 'smoke.test.js'), "require('assert').strictEqual(2 + 2, 4);\n");
  const executable = path.resolve(__dirname, '../target/debug/genos');
  try {
    const capsule = await agentCapsules.provision({
      executable, workspaceRoot, capsuleRoot, agentId: 'agent-test', name: 'Capsule test', role: 'Verifier', budgetSteps: 12
    });
    assert.match(capsule.id, /^[0-9a-f-]+$/);
    assert.match(capsule.genomeId, /^[0-9a-f-]+$/);
    assert.equal(capsule.root, path.join(capsuleRoot, '.genos-runtime', 'agent-test'));
    const inspected = spawnSync(executable, ['capsule', 'inspect', capsule.id, '--root', capsule.root], { encoding: 'utf8' });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).capsule_id, capsule.id);
    const executed = spawnSync(executable, ['agent', 'run', capsule.id, '--root', capsule.root, '--command', 'node smoke.test.js'], { encoding: 'utf8' });
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(JSON.parse(executed.stdout).exit_code, 0, executed.stdout);
    console.log('Agent capsule bootstrap checks passed.');
  } finally {
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
