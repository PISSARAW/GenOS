'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const compatibility = require('../src/services/genosCliCompatibility');
const checkouts = require('../src/services/genosCliCheckouts');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-replay-contract-'));
  const previousRoot = process.env.GENOS_STUDIO_ROOT;
  try {
    const fake = path.join(root, 'mock-cli');
    fs.writeFileSync(fake, 'old-contract');
    assert.throws(() => compatibility.assertReplayCompatible(fake, () => 'replay --agent-id AGENT'),
      { code: 'GENOS_CLI_INCOMPATIBLE' });
    assert.throws(() => compatibility.assertReplayCompatible(fake, () => { throw new Error('unavailable'); }),
      { code: 'GENOS_CLI_INCOMPATIBLE' });
    compatibility.assertReplayCompatible(fake, () => 'replay basic --snapshot SNAPSHOT');
    fs.writeFileSync(fake, 'changed-contract-must-be-checked');
    assert.throws(() => compatibility.assertReplayCompatible(fake, () => 'replay --agent-id AGENT'),
      { code: 'GENOS_CLI_INCOMPATIBLE' });
    qualifyWorktree(root);
    await qualifyRealReplay(root);
  } finally {
    if (previousRoot === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = previousRoot;
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('CLI protocol mismatch, linked checkout resolution, real hash-chain replay and tamper refusal: PASS');
}

function qualifyWorktree(root) {
  const shared = path.join(root, 'shared', '.git');
  const linked = path.join(root, 'linked');
  const metadata = path.join(shared, 'worktrees', 'linked');
  fs.mkdirSync(metadata, { recursive: true });
  fs.mkdirSync(linked);
  fs.writeFileSync(path.join(shared, 'HEAD'), 'ref: refs/heads/test');
  fs.writeFileSync(path.join(metadata, 'commondir'), '../..');
  fs.writeFileSync(path.join(linked, '.git'), 'gitdir: ' + metadata);
  assert.deepEqual(checkouts.checkoutRoots(linked), [linked, path.dirname(shared)]);
  assert.ok(checkouts.binaryCandidates(linked).some(file => file.startsWith(path.dirname(shared))));
}

async function qualifyRealReplay(root) {
  const cli = require('../src/services/genosCli');
  const { makeSnapshot } = require('../src/services/workerEvidenceReplaySnapshot');
  const { snapshot } = makeSnapshot({}, { workerId: 'replay-test', runId: 'replay-run',
    evidenceReport: { outcome: 'unresolved', claims: [], uncertainties: ['No unproven result.'] } });
  const file = path.join(root, 'snapshot.json');
  fs.writeFileSync(file, JSON.stringify(snapshot));
  const positive = await cli.runGenos(['replay', 'basic', '--snapshot', file], { root });
  assert.equal(positive.ok, true, JSON.stringify(positive));
  assert.equal(positive.json.replay_status, 'VERIFIED');
  assert.equal(positive.json.replayed_steps, 1);
  snapshot.state.working_memory[0].payload.executionRunId = 'tampered-run';
  fs.writeFileSync(file, JSON.stringify(snapshot));
  const negative = await cli.runGenos(['replay', 'basic', '--snapshot', file], { root });
  assert.equal(negative.ok, false);
  assert.match(negative.stderr, /hash-chain broken/);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
