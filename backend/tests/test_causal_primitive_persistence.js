'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const experimentService = require('../src/services/proceduralCausalExperimentService');
const temporal = require('../src/services/primitiveHandlers/temporal');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const snapshots = [{ snapshotId: 'snap-a', state: { x: 1 } }, { snapshotId: 'snap-b', state: { x: 2 } }];
  const experiment = await experimentService.createExperiment(db, {
    experimentId: 'aeis-causal-route', protocolVersion: 'v1', runnerId: 'runner-v1', environmentId: 'test',
    environmentManifest: { runtime: 'test' }, snapshots, arms: { control: { id: 'c' }, intervention: { id: 'i' } },
    seeds: [1, 2], budget: { maxSteps: 10, maxRuns: 8 }, analysis: { method: 'paired' },
  });
  const diffs = [];
  for (const snapshot of snapshots) {
    for (let seed = 1; seed <= 2; seed += 1) {
      const forks = await createCompletedPair(db, { experimentId: experiment.experimentId, snapshot, seed });
      const diff = await temporal.causalDiff({ db, baselineForkId: forks[0].forkId, interventionForkId: forks[1].forkId });
      assert.equal(diff.success, true);
      assert.equal(diff.scoreDelta, 1);
      diffs.push({ snapshotId: snapshot.snapshotId, diffId: diff.diffId });
    }
  }
  const groups = snapshots.map(({ snapshotId }) => ({ snapshotId, diffIds: diffs.filter((row) => row.snapshotId === snapshotId).map((row) => row.diffId) }));
  const analysis = await temporal.causalDiff({ db, experimentId: experiment.experimentId, groups, analysisSeed: 42, bootstrapReplicates: 1000 });
  assert.equal(analysis.success, true);
  assert.equal(analysis.snapshotCount, 2);
  assert.equal(analysis.verdict, 'supported_improvement');
  assert.equal((await db.get('SELECT analysis_id FROM procedural_causal_analyses WHERE analysis_id = ?', analysis.analysisId)).analysis_id, analysis.analysisId);
  await db.close();
}

async function createCompletedPair(db, input) {
  const pair = [];
  for (const arm of ['control', 'intervention']) {
    const fork = await experimentService.createFork(db, { experimentId: input.experimentId, snapshotId: input.snapshot.snapshotId, snapshotState: input.snapshot.state, arm, seed: input.seed });
    const result = { metric: arm === 'control' ? 0 : 1, trajectory: [{ step: arm }] };
    await db.run("UPDATE procedural_causal_forks SET status = 'completed' WHERE fork_id = ?", fork.forkId);
    await experimentService.recordEvent(db, { forkId: fork.forkId, eventType: 'RUN_RESULT',
      stateHash: experimentService.digest(result), payload: { result } });
    pair.push(fork);
  }
  return pair;
}

main().then(() => console.log('Causal production primitive persistence passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
