const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIsolatedWorkspace } = require('./src/services/agentRuntimeAdapter');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-isolation-'));
  const capsuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-capsules-'));
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = capsuleRoot;
  try {
    fs.writeFileSync(path.join(root, 'mission.txt'), 'parent evidence');
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'config'), 'not copied');
    fs.mkdirSync(path.join(root, 'target'));
    fs.writeFileSync(path.join(root, 'target', 'artifact'), 'not copied');
    const capsule = await createIsolatedWorkspace(root, 'worker-a');
    assert.strictEqual(fs.readFileSync(path.join(capsule, 'mission.txt'), 'utf8'), 'parent evidence');
    assert.strictEqual(fs.existsSync(path.join(capsule, '.git')), false);
    assert.strictEqual(fs.existsSync(path.join(capsule, 'target')), false);
    fs.writeFileSync(path.join(capsule, 'mission.txt'), 'worker evidence');
    assert.strictEqual(fs.readFileSync(path.join(root, 'mission.txt'), 'utf8'), 'parent evidence');
    console.log('Agent workspace isolation checks passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
