'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startNode } = require('./helpers/evidenceProcessClient.cjs');
const { prepare, claim, message, promotion } = require('./helpers/evidenceProcessFixtures.cjs');

async function accept(node, assertion) {
  let previous;
  for (const type of ['ASSERT', 'REQUEST_EVIDENCE', 'VERIFY', 'ACCEPT_UNDER_POLICY']) {
    const payload = type === 'ASSERT' ? { claim: assertion } : { claimId: assertion.claimId };
    const next = message(type, payload, { causes: previous ? [previous] : [] });
    await node.request('apply', next);
    previous = next.messageId;
  }
}

async function applyRevision(node, counterexample, consumer) {
  await node.request('apply', counterexample);
  const invalidation = message('INVALIDATE_DEPENDENTS', {
    claimId: 'root', revisionMessageId: counterexample.messageId,
  }, { id: `${consumer}:invalidate`, causes: [counterexample.messageId] });
  await node.request('apply', invalidation);
  const ack = message('ACK_APPLIED', { claimId: 'root', revisionMessageId: counterexample.messageId },
    { id: `${consumer}:ack`, sender: consumer, causes: [invalidation.messageId] });
  return { ack, result: await node.request('apply', ack) };
}

async function rejectForgedBindings(node) {
  const fields = ['artifactDigest', 'baseDigest', 'environmentDigest'];
  const forgedClaims = fields.map(field => {
    const value = claim(`forged-${field}`);
    value.subject = { ...value.subject, [field]: `sha256:${'0'.repeat(64)}` };
    return value;
  });
  const predicate = claim('forged-predicate');
  predicate.predicate = { command: 'different predicate', expectedExitCode: 0 };
  forgedClaims.push(predicate);
  for (const value of forgedClaims) await assert.rejects(accept(node, value), /Demo binding mismatch/);
}

async function scenario(directory) {
  const nodes = [];
  const places = Array.from({ length: 4 }, (_, index) => path.join(directory, `node-${index}`));
  try {
    for (const place of places) { prepare(place); nodes.push(await startNode(place)); }
    assert.equal(new Set(nodes.map(node => node.pid)).size, 4);
    await rejectForgedBindings(nodes[0]);
    for (const node of nodes) await accept(node, claim());
    for (let index = 1; index < 4; index += 1) {
      await accept(nodes[index], claim(`dependent-${index}`, ['root']));
      assert.equal(await nodes[index].request('promote', promotion(`dependent-${index}`)), true);
    }
    const stale = promotion();
    stale.subject = { ...stale.subject, baseDigest: `sha256:${'0'.repeat(64)}` };
    assert.equal(await nodes[0].request('promote', stale), false);
    await nodes[2].stop();
    const challenge = message('CHALLENGE', { claimId: 'root' },
      { causes: ['root:ACCEPT_UNDER_POLICY'] });
    await nodes[0].request('apply', challenge);
    const counterexample = message('COUNTEREXAMPLE', { claimId: 'root',
      counterexampleResultId: 'input-negative-one', domainFingerprint: claim().domain.fingerprint },
    { causes: [challenge.messageId] });
    await nodes[0].request('apply', counterexample);
    assert.equal(await nodes[0].request('promote', promotion()), false);
    nodes[2] = await startNode(places[2]);
    const acknowledgements = [];
    for (let index = 1; index < 4; index += 1) {
      const node = nodes[index];
      await node.request('apply', challenge);
      const outcome = await applyRevision(node, counterexample, `consumer-${index}`);
      acknowledgements.push(outcome.ack.messageId);
      assert.equal(await node.request('promote', promotion(`dependent-${index}`)), false);
      assert.equal((await node.request('claim', `dependent-${index}`)).status, 'invalidated');
      const count = (await node.request('history')).length;
      await node.request('apply', counterexample);
      await node.request('apply', outcome.ack);
      assert.equal((await node.request('history')).length, count);
    }
    await nodes[2].stop();
    nodes[2] = await startNode(places[2]);
    assert.equal(await nodes[2].request('promote', promotion('dependent-2')), false);
    return { processes: 4, dependentClaims: 3, acknowledgements, restartPreservedRevocation: true };
  } finally { await Promise.all(nodes.map(node => node.stop())); }
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-evidence-process-'));
  try { console.log('EVIDENCE process recovery:', JSON.stringify(await scenario(directory))); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
