#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suite = JSON.parse(readFileSync(path.join(here, 'suite.json'), 'utf8'));
assert.equal(new Set(suite.tasks.map((task) => task.id)).size, suite.tasks.length);

for (const task of suite.tasks) {
  const target = path.join(here, 'tasks', task.id);
  const publicRun = spawnSync('node', ['--test', path.join(target, 'public.test.mjs')], { encoding: 'utf8' });
  assert.equal(publicRun.status, 0, `${task.id} public test must establish the starting baseline`);
  const hiddenRun = spawnSync('node', ['--test', path.join(here, task.grader)], {
    encoding: 'utf8', env: { ...process.env, TARGET_DIR: target },
  });
  const pass = Number(hiddenRun.stdout.match(/^# pass (\d+)$/m)?.[1] ?? 0);
  const fail = Number(hiddenRun.stdout.match(/^# fail (\d+)$/m)?.[1] ?? 0);
  assert.equal(pass + fail, 8, `${task.id} must expose eight independent hidden checks`);
  assert.ok(pass <= 1, `${task.id} starter must not have a high hidden baseline`);
}

const pilot = JSON.parse(readFileSync(path.join(here, 'results', 'latest.json'), 'utf8'));
assert.equal(pilot.publication_gate.publishable, false);
assert.ok(pilot.samples.some((sample) => sample.condition === 'genos' && sample.genos_mcp_tool_calls > 0));
console.log('GenOS AgentBench harness: OK');
