'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { execFileSync } = require('node:child_process');

const MIN_FREE_BYTES = 512n * 1024n * 1024n;
const LOCK_NAME = 'genos-full-test-suite.lock';

function gitOutput(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function repositoryRoot() {
  return gitOutput(process.cwd(), ['rev-parse', '--show-toplevel']);
}

function testLockPath(root) {
  const commonDirectory = path.resolve(root, gitOutput(root, ['rev-parse', '--git-common-dir']));
  return path.join(commonDirectory, LOCK_NAME);
}

function readLock(filename) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (_) {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function validLockOwner(owner) {
  return Number.isSafeInteger(owner?.pid) && owner.pid > 0
    && typeof owner.token === 'string' && owner.token.length > 0;
}

function writeLock(filename, owner) {
  fs.writeFileSync(filename, JSON.stringify(owner), { flag: 'wx' });
}

function removeStaleLock(filename) {
  const stale = `${filename}.stale-${crypto.randomUUID()}`;
  fs.renameSync(filename, stale);
  fs.unlinkSync(stale);
}

function acquireTestLock(filename, token, isAlive = processIsAlive) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeLock(filename, { pid: process.pid, token, startedAt: new Date().toISOString() });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = readLock(filename);
      if (!validLockOwner(owner)) {
        throw new Error(`Full test suite lock ${filename} has unreadable owner metadata.`);
      }
      if (isAlive(owner.pid)) {
        throw new Error(`Full test suite already owns ${filename} (PID ${owner?.pid ?? 'unknown'}).`);
      }
      try {
        removeStaleLock(filename);
      } catch (renameError) {
        if (renameError.code !== 'ENOENT') throw renameError;
      }
    }
  }
  throw new Error(`Could not acquire full test suite lock ${filename}.`);
}

function assertTestLockOwner(filename, token) {
  const owner = readLock(filename);
  if (!validLockOwner(owner) || owner.token !== token || !processIsAlive(owner.pid)) {
    throw new Error(`Nested test suite cannot verify its parent lock ${filename}.`);
  }
}

function releaseTestLock(filename, token) {
  const owner = readLock(filename);
  if (owner?.token === token) fs.unlinkSync(filename);
}

function availableBytes(directory) {
  const stats = fs.statfsSync(directory, { bigint: true });
  return stats.bavail * stats.bsize;
}

function assertMinimumSpace(available, required, location) {
  if (available >= required) return;
  const freeMib = available / (1024n * 1024n);
  const requiredMib = required / (1024n * 1024n);
  throw new Error(`Full test suite requires ${requiredMib} MiB free; ${location} has ${freeMib} MiB.`);
}

function checkDiskSpace(directories) {
  for (const directory of directories) {
    assertMinimumSpace(availableBytes(directory), MIN_FREE_BYTES, directory);
  }
}

function createTestEnvironment(testRoot, token) {
  const env = { ...process.env, NODE_ENV: 'test', GENOS_TEST_MODE: '1',
    GENOS_TEST_RUN_ROOT: testRoot, GENOS_TEST_LOCK_TOKEN: token,
    GENOS_DISABLE_DOTENV: '1', GENOS_ADMIN_PASSWORD: 'genos-test-only-password',
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_TOOL_MEMBRANE_HMAC_SECRET: crypto.randomBytes(32).toString('hex') };
  delete env.GENOS_DB_PATH;
  delete env.GENOS_DB_BOOTSTRAP_SKIP;
  delete env.GENOS_DB_BACKUP_SKIP;
  return env;
}

function runNpm(packageDirectory, env) {
  const npmPath = env.npm_execpath;
  const command = npmPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = npmPath ? [npmPath, 'run', 'test:unlocked'] : ['run', 'test:unlocked'];
  const result = spawnSync(command, args, { cwd: packageDirectory, env,
    shell: !npmPath && process.platform === 'win32', stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runSuite(scope) {
  if (!['root', 'backend'].includes(scope)) throw new Error(`Unknown test scope: ${scope}`);
  const root = repositoryRoot();
  const lock = testLockPath(root);
  const inheritedToken = process.env.GENOS_TEST_LOCK_TOKEN;
  const token = inheritedToken || crypto.randomUUID();
  const ownsLock = !inheritedToken;
  if (ownsLock) acquireTestLock(lock, token);
  else assertTestLockOwner(lock, token);

  const inheritedRoot = process.env.GENOS_TEST_RUN_ROOT;
  const testRoot = inheritedRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'genos-test-suite-'));
  const ownsRoot = !inheritedRoot;
  try {
    checkDiskSpace([root, os.tmpdir()]);
    const packageDirectory = scope === 'backend' ? path.join(root, 'backend') : root;
    return runNpm(packageDirectory, createTestEnvironment(testRoot, token));
  } finally {
    if (ownsRoot) fs.rmSync(testRoot, { recursive: true, force: true });
    if (ownsLock) releaseTestLock(lock, token);
  }
}

function main() {
  try {
    process.exitCode = runSuite(process.argv[2] || 'root');
  } catch (error) {
    console.error(`Test suite preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { acquireTestLock, assertMinimumSpace, releaseTestLock };
