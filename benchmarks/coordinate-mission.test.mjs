import test from 'node:test';
import assert from 'node:assert/strict';
import { missionOrder, parseArguments, taskCommand } from './coordinate-mission.mjs';

test('default mission order matches the requested benchmark sequence', () => {
  assert.deepEqual(parseArguments([]).tasks, ['B01', 'B02', 'B03', 'B04', 'B05', 'B09', 'B06', 'B07', 'B10', 'B08']);
  assert.deepEqual(parseArguments([]).tasks, missionOrder);
});

test('public tasks remain gated and are never passed --execute implicitly', () => {
  for (const taskId of ['B06', 'B07', 'B08']) {
    const [, args] = taskCommand(taskId, 'benchmarks/results');
    assert.equal(args.includes('--execute'), false);
  }
});

test('unknown tasks fail closed', () => {
  assert.throws(() => parseArguments(['--tasks', 'B01,B99']), /unsupported task/);
});

test('dry-run does not imply execution', () => {
  const options = parseArguments(['--dry-run']);
  assert.equal(options.dryRun, true);
  assert.equal(options.execute, false);
});
