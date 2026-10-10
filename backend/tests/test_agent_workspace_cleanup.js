const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanupWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

async function run() {
  const capsuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cleanup-'));
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = capsuleRoot;
  process.env.GENOS_ADMIN_PASSWORD ||= 'test-only-agent-cleanup-password';
  const workspace = path.join(capsuleRoot, 'agent-a');
  const runtimeRoot = path.join(capsuleRoot, '.genos-runtime', 'agent-a');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'evidence.txt'), 'temporary');
  fs.writeFileSync(path.join(runtimeRoot, 'snapshot.json'), '{}');
  try {
    const db = await require('../src/db').getDatabase(path.join(capsuleRoot, 'test.db'));
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('agent-a', 'agent-a', 'worker', 'completed')");
    fs.writeFileSync(path.join(workspace, '.genos-epoch'), 'epoch-agent-a');
    await cleanupWorkspace(workspace, 'agent-a');
    assert.equal(fs.existsSync(workspace), false);
    assert.equal(fs.existsSync(runtimeRoot), false);
  } finally {
    await require('../src/db').closeDatabase();
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
  console.log('Agent workspace cleanup checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
