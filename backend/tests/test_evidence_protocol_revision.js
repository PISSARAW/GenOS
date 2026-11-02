'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { EvidenceRevision } = require('../src/services/evidenceProtocol/revision');
const fixture = require('./helpers/evidenceProtocolFixture');

function install(runtime, overrides = {}) {
  return new EvidenceRevision({ conversation: runtime, verifyCounterexample: async (request) =>
    ({ ...request, status: 'validated', receiptDigest: digest(request) }), ...overrides });
}

async function tree(runtime) {
  const root = fixture.claim();
  const child = fixture.claim({ claimId: 'child', dependencies: ['root'] });
  const leaf = fixture.claim({ claimId: 'leaf', dependencies: ['child'] });
  const unknown = fixture.claim({ claimId: 'unknown', dependencies: ['root'],
    domain: { fingerprint: digest('different-domain'), description: 'unknown relation' } });
  for (const claim of [root, child, leaf, unknown]) await fixture.accept(runtime, claim);
  assert.equal(runtime.canPromote(fixture.promotion(leaf)), true);
  return { root, child, leaf, unknown };
}

async function challenge(runtime) {
  const message = fixture.message('CHALLENGE', { claimId: 'root' },
    { causalRefs: [runtime.claim('root').lastMessageId] });
  await runtime.apply(message);
  return message;
}

function counterexample(challengeMessage) {
  return fixture.message('COUNTEREXAMPLE', { claimId: 'root', counterexampleResultId: 'result:1',
    domainFingerprint: fixture.claim().domain.fingerprint }, { causalRefs: [challengeMessage.messageId] });
}

async function durableRevision() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-revision-'));
  const options = { dbPath: path.join(directory, 'revision.db') };
  let runtime = fixture.conversation(options);
  install(runtime);
  try {
    const claims = await tree(runtime);
    const challenged = await challenge(runtime);
    assert.equal(runtime.canPromote(fixture.promotion(claims.leaf)), false);
    const example = counterexample(challenged);
    const result = await runtime.apply(example);
    assert.equal(runtime.claim('root').status, 'refuted');
    assert.equal(runtime.claim('child').status, 'invalidated');
    assert.equal(runtime.claim('leaf').status, 'invalidated');
    assert.equal(runtime.claim('unknown').status, 'suspended');
    assert.equal(result.affected.length, 4);
    const ack = fixture.message('ACK_APPLIED', { claimId: 'root', revisionMessageId: example.messageId });
    await assert.rejects(runtime.apply(ack), /requires applied invalidation/);
    runtime.close();
    runtime = fixture.conversation(options);
    install(runtime);
    assert.deepEqual(await runtime.apply(example), result);
    const invalidate = fixture.message('INVALIDATE_DEPENDENTS', { claimId: 'root', revisionMessageId: example.messageId },
      { causalRefs: [example.messageId] });
    const application = await runtime.apply(invalidate);
    assert.equal(application.applied.length, 4);
    await assert.rejects(runtime.apply(ack), /applied causal reference/);
    const acceptedAck = fixture.message('ACK_APPLIED', ack.payload, { causalRefs: [invalidate.messageId] });
    await runtime.apply(acceptedAck);
    assert.equal(runtime.claim('root').acknowledgement.appliedMessageId, invalidate.messageId);
    assert.equal(runtime.canPromote(fixture.promotion(claims.leaf)), false);
    assert.equal(runtime.history().filter((row) => row.message.messageId === example.messageId).length, 1);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function falseCounterexample() {
  const runtime = fixture.conversation();
  install(runtime, { verifyCounterexample: async (request) => ({ ...request, status: 'validated',
    receiptDigest: digest(request), targetId: 'forged-target' }) });
  try {
    await tree(runtime);
    const challenged = await challenge(runtime);
    const version = runtime.history().length;
    await assert.rejects(runtime.apply(counterexample(challenged)), /verification rejected/);
    assert.equal(runtime.claim('child').status, 'accepted');
    assert.equal(runtime.claim('root').status, 'challenged');
    assert.equal(runtime.history().length, version);
  } finally { runtime.close(); }
}

async function retraction() {
  const runtime = fixture.conversation();
  install(runtime);
  try {
    const claims = await tree(runtime);
    await assert.rejects(runtime.apply(fixture.message('RETRACT', { claimId: 'root' },
      { causalRefs: [runtime.claim('root').lastMessageId],
        sender: { agentId: 'other', incarnationId: 'incarnation:2', trustDomain: 'local' } })), /only producer/);
    const retract = fixture.message('RETRACT', { claimId: 'root' },
      { causalRefs: [runtime.claim('root').lastMessageId] });
    await runtime.apply(retract);
    assert.equal(runtime.claim('root').status, 'retracted');
    assert.equal(runtime.claim('leaf').status, 'suspended');
    assert.equal(runtime.canPromote(fixture.promotion(claims.leaf)), false);
  } finally { runtime.close(); }
}

async function noResurrection() {
  const runtime = fixture.conversation();
  install(runtime);
  try {
    const claims = await tree(runtime);
    const staleCause = runtime.claim('root').lastMessageId;
    const challenged = await challenge(runtime);
    await assert.rejects(runtime.apply(fixture.message('RETRACT', { claimId: 'root' },
      { causalRefs: [staleCause] })), /latest causal reference/);
    const example = counterexample(challenged);
    await runtime.apply(example);
    const retract = fixture.message('RETRACT', { claimId: 'root' }, { causalRefs: [example.messageId] });
    await runtime.apply(retract);
    await assert.rejects(runtime.apply(fixture.message('CHALLENGE', { claimId: 'root' },
      { causalRefs: [retract.messageId] })), /out of order/);
    const freshCounterexample = fixture.message('COUNTEREXAMPLE', example.payload,
      { causalRefs: [challenged.messageId] });
    await assert.rejects(runtime.apply(freshCounterexample), /requires challenge/);
    await assert.rejects(runtime.apply(fixture.message('VERIFY', { claimId: 'root' },
      { causalRefs: [retract.messageId] })), /out of order/);
    assert.equal(runtime.claim('root').status, 'retracted');
    assert.equal(runtime.canPromote(fixture.promotion(claims.leaf)), false);
  } finally { runtime.close(); }
}

async function main() {
  await durableRevision();
  await falseCounterexample();
  await retraction();
  await noResurrection();
  console.log('EVIDENCE durable revision and applied acknowledgement passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
