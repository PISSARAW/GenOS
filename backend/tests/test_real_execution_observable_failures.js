'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const { runIsolated } = require('../src/services/sandboxExecutor');
const vfsSandboxService = require('../src/services/vfsSandboxService');

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-real-exec-'));
  const checksDir = path.join(tmpDir, 'checks');
  await fs.mkdir(checksDir, { recursive: true });

  try {
    // 1. Commande échouée avec exitCode explicite
    const failScript = path.join(checksDir, 'verify_fail.js');
    await fs.writeFile(failScript, 'process.exit(42);\n');

    const failedRun = await runIsolated({
      command: 'node checks/verify_fail.js',
      cwd: tmpDir,
      timeoutMs: 5000,
    });
    assert.equal(failedRun.success, false, 'failed run must have success: false');
    assert.equal(failedRun.exitCode, 42, 'failed run must preserve exitCode 42');

    // 2. Commande qui dépasse le timeout
    const hangScript = path.join(checksDir, 'verify_hang.js');
    await fs.writeFile(hangScript, 'setInterval(() => {}, 1000);\n');

    const timeoutRun = await runIsolated({
      command: 'node checks/verify_hang.js',
      cwd: tmpDir,
      timeoutMs: 500,
    });
    assert.equal(timeoutRun.timedOut, true, 'timeoutRun must have timedOut: true');
    assert.equal(timeoutRun.success, false, 'timeoutRun must have success: false');
    assert.notEqual(timeoutRun.exitCode, 0, 'timed-out execution must NEVER have exitCode: 0');
    assert.equal(timeoutRun.exitCode, -1, 'timed-out execution must report exitCode: -1');

    // 3. Commande hors whitelist rejetée immédiatement
    await assert.rejects(
      async () => runIsolated({ command: 'malicious_binary --payload', cwd: tmpDir }),
      /whitelist|not in sandbox/i
    );

    // 4. vfsSandboxService en mode réel avec commande en échec
    const vfsResult = await vfsSandboxService.executeSandboxed('ws-test', 'exit 7', {
      mode: 'real',
      allowRealExecution: true,
      workspaceRoot: tmpDir,
      timeoutMs: 5000,
    });
    assert.equal(vfsResult.success, false, 'vfs execution must report success: false on failure');
    assert.equal(vfsResult.exitCode, 7, 'vfs execution must report exact exitCode 7');

    console.log('Real execution observable failure checks passed.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
