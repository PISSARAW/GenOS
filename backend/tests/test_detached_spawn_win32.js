'use strict';

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const helper = require('../bin/detachedSpawn.cjs');

const small = JSON.stringify({ action: 'ping', mission: 'hello world' });
assert.deepEqual(helper.toSpawnArgs(small), [small]);

const big = JSON.stringify({ action: 'dispatch', mission: 'x'.repeat(20000) });
const args = helper.toSpawnArgs(big);
assert.equal(args[0], '--payload-file');

const probe = path.resolve(__dirname, 'fixtures', 'payload_probe.cjs');
const child = spawnSync(process.execPath, [probe, ...args], { encoding: 'utf8' });
assert.equal(child.status, 0, child.stderr);
assert.equal(child.stdout.trim(), big);

console.log('detached spawn payload-file transport: OK');
