'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const destination = path.join('D:\\GenOS-runs', `denied-worker-protocol-${crypto.randomUUID()}`);
const result = spawnSync(process.execPath,
  [path.resolve(__dirname, '../../benchmarks/qwen-worker-missions/live-handoff.cjs'), destination],
  { env: { ...process.env, GENOS_EXECUTION_MODE: 'worker' }, encoding: 'utf8', windowsHide: true, timeout: 10000 });
assert.equal(result.status, 1, result.stdout + result.stderr);
assert.match(result.stderr, /Delegated workers cannot run this operator protocol/);
assert.equal(fs.existsSync(destination), false, 'Worker refusal must precede all output or database creation.');
console.log('Worker context cannot create an operator mission or budget through the live protocol: PASS');
