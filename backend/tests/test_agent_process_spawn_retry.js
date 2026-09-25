'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { spawnRuntimeWithRetry } = require('../src/services/agentProcessSupervisor');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-spawn-retry-'));
  const cwd = path.join(root, 'missing', 'worker-cwd');
  try {
    const child = await spawnRuntimeWithRetry({
      cmd: process.execPath,
      args: ['-e', 'process.exit(0)']
    }, { cwd, stdio: 'ignore' });
    const [code] = await once(child, 'close');
    assert.equal(code, 0);
    assert.equal(fs.existsSync(cwd), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Runtime spawn recovery checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
