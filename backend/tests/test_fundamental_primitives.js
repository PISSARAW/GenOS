const assert = require('node:assert/strict');
const fundamentals = require('../src/services/primitiveHandlers/fundamentals');

async function main() {
  const snapshot = await fundamentals.snapshot({ workspaceId: 'missing-workspace' });
  assert.equal(snapshot.success, false);
  assert.match(snapshot.error, /not found/);

  const revert = await fundamentals.safeRevert({ workspaceId: 'missing-workspace', snapshotId: 'missing-snapshot' });
  assert.equal(revert.success, false);
  assert.match(revert.error, /not found/);

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

  console.log('Fundamental primitives: all assertions passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });