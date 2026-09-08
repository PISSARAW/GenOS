const assert = require('node:assert/strict');
const fundamentals = require('../src/services/primitiveHandlers/fundamentals');
const snapshotStore = require('../src/services/workspaceSnapshotStore');

async function main() {
  const snapshot = await fundamentals.snapshot({ workspaceId: 'missing-workspace' });
  assert.equal(snapshot.success, false);
  assert.match(snapshot.error, /not found/);

  const revert = await fundamentals.safeRevert({ workspaceId: 'missing-workspace', snapshotId: 'missing-snapshot' });
  assert.equal(revert.success, false);
  assert.match(revert.error, /not found/);
  assert.equal(snapshotStore.isAllowedTestCommand('cargo test --lib'), true);
  assert.equal(snapshotStore.isAllowedTestCommand('npm test'), true);
  assert.equal(snapshotStore.isAllowedTestCommand('node -e "rm -rf /"'), false);
  assert.equal(snapshotStore.isAllowedTestCommand('npx attacker/pkg'), false);
  assert.equal(snapshotStore.isAllowedTestCommand('npm run evil'), false);

  const dryRun = await fundamentals.vfsDryRun({ workspaceId: 'workspace-test', patch: { path: 'src/index.js', content: 'export default 1;' } });
  assert.equal(dryRun.success, true);
  assert.equal(dryRun.dryRunCompleted, true);
  assert.equal(dryRun.sideEffects.filesCreated[0], 'src/index.js');

  const unsafeDryRun = await fundamentals.vfsDryRun({ workspaceId: 'workspace-test', patch: { path: '../escape.js', content: 'unsafe' } });
  assert.equal(unsafeDryRun.success, false);

  const fork = await fundamentals.fork({ orchestratorId: 'missing-orchestrator', mission: 'test fork' });
  assert.equal(fork.success, false);
  assert.match(fork.error, /not found/);

  const evaluation = await fundamentals.evaluate({ task: 'test fundamental evaluation' });
  assert.equal(evaluation.success, false);
  assert.equal(evaluation.status, 'incomplete');
  assert.equal(typeof evaluation.code, 'string');

  const unexecutedInvariant = await fundamentals.verify({ invariants: ['must be checked'] });
  assert.equal(unexecutedInvariant.success, false);
  assert.match(unexecutedInvariant.failures[0], /never assumed to pass/);
  const missingWorkspaceTest = await fundamentals.verify({ testCommand: 'cargo test', workspaceId: 'missing-workspace' });
  assert.equal(missingWorkspaceTest.success, false);

  console.log('Fundamental primitives: all assertions passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });