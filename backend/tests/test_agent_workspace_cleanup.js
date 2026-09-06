const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanupWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

async function run() {
  const capsuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cleanup-'));
  const workspace = path.join(capsuleRoot, 'agent-a');
  const runtimeRoot = path.join(capsuleRoot, '.genos-runtime', 'agent-a');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'evidence.txt'), 'temporary');
  fs.writeFileSync(path.join(runtimeRoot, 'snapshot.json'), '{}');
  try {
    await cleanupWorkspace(workspace, 'agent-a');
    assert.equal(fs.existsSync(workspace), false);
    assert.equal(fs.existsSync(runtimeRoot), false);
  } finally {
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
  }
  console.log('Agent workspace cleanup checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });