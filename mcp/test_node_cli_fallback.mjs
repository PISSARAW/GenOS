import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeNodeFallback } from './nodeCliFallback.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-fallback-'));
const snapshot = path.join(root, 'snapshot.json');
const created = JSON.parse(await executeNodeFallback(['snapshot'], { agent: 'test', out: snapshot }));
assert.equal(created.success, true);
assert.equal(created.fallbackUsed, true);
assert.equal(fs.existsSync(snapshot), true);

const replay = JSON.parse(await executeNodeFallback(['replay'], { snapshot }));
assert.equal(replay.success, true);
assert.equal(replay.eventsReplayed, 0);

const merge = JSON.parse(await executeNodeFallback(['merge', 'branch-a'], { branch_id: 'branch-a' }));
assert.equal(merge.success, false);
assert.equal(merge.status, 'capability_unavailable');

fs.rmSync(root, { recursive: true, force: true });
console.log('Node fallback reports only verified operations as successful.');
