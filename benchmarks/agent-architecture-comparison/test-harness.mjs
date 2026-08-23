#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orchestrationFinished } from './support.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../genos-agentbench');
const suite = JSON.parse(readFileSync(path.join(source, 'suite.json'), 'utf8'));
assert.equal(suite.tasks.length, 3);
assert.equal(new Set(suite.tasks.map((task) => task.id)).size, suite.tasks.length);
assert.equal(orchestrationFinished([{ status: 'idle' }], []), false, 'initial idle state is not completion');
assert.equal(orchestrationFinished([{ status: 'running' }], ['AGENT_COMPLETED']), false);
assert.equal(orchestrationFinished([{ status: 'idle' }, { status: 'idle' }], ['AGENT_COMPLETED']), true);

for (const task of suite.tasks) {
  const workspace = path.join(source, 'tasks', task.id);
  const publicRun = spawnSync('node', ['--test', path.join(workspace, 'public.test.mjs')], { encoding: 'utf8' });
  assert.equal(publicRun.status, 0, `${task.id}: public baseline must pass`);
  const hiddenRun = spawnSync('node', ['--test', path.join(source, task.grader)], {
    encoding: 'utf8', env: { ...process.env, TARGET_DIR: workspace }
  });
  const pass = Number(hiddenRun.stdout.match(/^# pass (\d+)$/m)?.[1] ?? 0);
  const fail = Number(hiddenRun.stdout.match(/^# fail (\d+)$/m)?.[1] ?? 0);
  assert.equal(pass + fail, 8, `${task.id}: hidden grader must expose eight checks`);
  assert.ok(pass <= 1, `${task.id}: starter must remain unsolved`);
}

console.log('Agent architecture benchmark harness: OK');
