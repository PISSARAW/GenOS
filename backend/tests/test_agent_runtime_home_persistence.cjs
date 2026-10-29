'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runtimeHome = require('../bin/agent-runtime-home.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-codex-home-'));
const originalEnv = {
  CODEX_HOME: process.env.CODEX_HOME,
  GENOS_PERSISTENT_CODEX_HOME: process.env.GENOS_PERSISTENT_CODEX_HOME,
  GENOS_RUNNER_LOG_DIR: process.env.GENOS_RUNNER_LOG_DIR
};

try {
  process.env.CODEX_HOME = path.join(root, 'host');
  process.env.GENOS_PERSISTENT_CODEX_HOME = path.join(root, 'persistent');
  process.env.GENOS_RUNNER_LOG_DIR = path.join(root, 'logs');
  const first = runtimeHome.setupCodexHome();
  const hookPath = path.join(first.home, 'hooks.json');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  const policyHook = fs.readFileSync(path.join(__dirname, '../bin/genos-pre-tool-policy.cjs'));
  const expectedDigest = crypto.createHash('sha256').update(policyHook).digest('hex');
  assert.equal(JSON.parse(hookContent).description, `Enforce the GenOS mission policy hook (sha256:${expectedDigest}).`);
  runtimeHome.cleanup({ isolatedRuntimeRoot: first.root });
  assert(fs.existsSync(hookPath), 'cleanup must preserve the reviewed persistent hook definition');
  const second = runtimeHome.setupCodexHome();
  assert.equal(fs.readFileSync(path.join(second.home, 'hooks.json'), 'utf8'), hookContent,
    'subsequent runs must reuse the identical hook definition and trust hash');
  runtimeHome.cleanup({ isolatedRuntimeRoot: second.root });
  assert.throws(() => runtimeHome.persistReviewedFile(hookPath, '{}', true),
    error => error.code === 'GENOS_CODEX_HOOK_CONFIGURATION_CHANGED');
  process.env.GENOS_PERSISTENT_CODEX_HOME = 'relative/path';
  assert.throws(() => runtimeHome.setupCodexHome(), /must be an absolute path/);
} finally {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write('Persistent Codex home preserves hook review and fails closed on definition drift.\n');
