'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../src/services/continuityProtocol/contract');
const { RecognitionConversation } = require('../src/services/continuityProtocol/recognition');
const fixture = require('./helpers/continuityRecognitionFixture');

const alter = (message, overrides) => createMessage({ ...message, ...overrides }, { now: fixture.NOW });

async function durableRecognition() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-continuity-recognition-'));
  const dbPath = path.join(directory, 'recognition.db');
  let runtime = fixture.conversation({ dbPath });
  const messages = fixture.flow();
  try {
    const results = await fixture.applyFlow(runtime, messages);
    assert.equal(results[3].status, 'recognized');
    assert.equal(results[3].permissionsInherited, false);
    assert.equal(results[3].authorityTransferred, false);
    runtime.close();
    runtime = fixture.conversation({ dbPath });
    assert.equal(runtime.state(messages[0]).status, 'recognized');
    assert.equal(runtime.history().length, 4);
    assert.deepEqual(await runtime.apply(messages[3]), results[3]);
    assert.equal(runtime.history().length, 4);
    await assert.rejects(runtime.apply(alter(messages[3], { operationId: 'changed-operation' })), /idempotency conflict/);
    assert.equal(runtime.history().length, 4);
    const other = fixture.flow({ conversationId: 'post-restart' });
    await runtime.apply(other[0]);
    await assert.rejects(runtime.apply(alter(other[1], {
      payload: { ...other[1].payload, nonce: messages[1].payload.nonce },
    })), /nonce already used/);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function relationSemantics() {
  const values = [
    ['continuation', fixture.identity(), fixture.identity({ incarnationId: 'old' })],
    ['restore', fixture.identity(), fixture.identity({ incarnationId: 'old', historyDigest: digest('older-history') })],
    ['fork', fixture.identity({ agentId: 'child', branchId: 'child-branch' }), fixture.identity({ incarnationId: 'old' })],
    ['succession', fixture.identity({ agentId: 'successor' }), fixture.identity({ incarnationId: 'old' })],
  ];
  for (const [relation, identity, predecessor] of values) {
    const runtime = fixture.conversation();
    try {
      const messages = fixture.flow({ sender: fixture.actor(identity), payload: { identity, predecessor, relation } });
      const results = await fixture.applyFlow(runtime, messages);
      assert.equal(results[3].relation, relation);
      assert.equal(results[3].permissionsInherited, false);
      assert.deepEqual(runtime.state(messages[0]).presentation.payload.predecessor, predecessor);
    } finally { runtime.close(); }
  }
}

async function invalidRelations() {
  const invalid = [
    { relation: 'fork' }, { relation: 'succession' },
    { identity: fixture.identity({ agentId: 'different' }) },
    { predecessor: fixture.identity() },
    { identity: fixture.identity({ branchId: 'different' }) },
  ];
  const runtime = fixture.conversation();
  try {
    for (const change of invalid) {
      const payload = { ...fixture.payload('PRESENT'), ...change };
      const message = fixture.envelope('PRESENT', payload, { sender: fixture.actor(payload.identity) });
      await assert.rejects(runtime.apply(message), /relation|incarnation|branch/);
    }
    assert.equal(runtime.history().length, 0);
  } finally { runtime.close(); }
}

async function wrongBindings() {
  const runtime = fixture.conversation();
  const messages = fixture.flow();
  try {
    await runtime.apply(messages[0]);
    await assert.rejects(runtime.apply(alter(messages[2], { causalRefs: [messages[0].messageId] })), /out of order/);
    await assert.rejects(runtime.apply(alter(messages[1], { audience: messages[1].sender })), /participant|audience/);
    await assert.rejects(runtime.apply(alter(messages[1], { causalRefs: [] })), /causal/);
    await runtime.apply(messages[1]);
    await assert.rejects(runtime.apply(alter(messages[2], { payload: { ...messages[2].payload, nonce: 'b'.repeat(64) } })), /nonce mismatch/);
    await assert.rejects(runtime.apply(alter(messages[2], { payload: { ...messages[2].payload, presentationDigest: digest('unrelated') } })), /presentation digest/);
    await assert.rejects(runtime.apply(alter(messages[2], { generations: { ...messages[2].generations, incarnation: 5 } })), /generation/);
    await runtime.apply(messages[2]);
    await assert.rejects(runtime.apply(alter(messages[3], { payload: { ...messages[3].payload, proofDigest: digest('unrelated') } })), /binding/);
    await runtime.apply(messages[3]);
    assert.equal(runtime.history().length, 4);
  } finally { runtime.close(); }
}

async function rejectedReceipts() {
  const receipts = [
    (request) => ({ ...fixture.receipt(request), requestDigest: digest('other-request') }),
    (request) => ({ ...fixture.receipt(request), historyRetained: false }),
    (request) => ({ ...fixture.receipt(request), proofDigest: digest('other-proof') }),
  ];
  for (const receipt of receipts) {
    const runtime = fixture.conversation({ verifyAttestation: async (request) => receipt(request) });
    const messages = fixture.flow();
    try {
      await fixture.applyFlow(runtime, messages.slice(0, 2));
      await assert.rejects(runtime.apply(messages[2]), /binding|history/);
      assert.equal(runtime.state(messages[0]).status, 'challenged');
      assert.equal(runtime.history().length, 2);
    } finally { runtime.close(); }
  }
}

async function nonceAndExpiry() {
  let now = fixture.NOW;
  const runtime = fixture.conversation({ clock: () => now });
  const messages = fixture.flow();
  try {
    await fixture.applyFlow(runtime, messages.slice(0, 2));
    const second = fixture.flow({ conversationId: 'other-conversation' });
    await runtime.apply(second[0]);
    const reused = alter(second[1], { payload: { ...second[1].payload, nonce: messages[1].payload.nonce } });
    await assert.rejects(runtime.apply(reused), /nonce already used/);
    assert.equal(runtime.state(second[0]).status, 'presented');
    now = '2026-11-02T10:02:00.000Z';
    await assert.rejects(runtime.apply(messages[2]), /challenge expired/);
    assert.equal(runtime.state(messages[0]).status, 'challenged');
  } finally { runtime.close(); }
}

async function authorityAndRace() {
  let authorized = true;
  const runtime = fixture.conversation({ authorize: async () => authorized,
    verifyAttestation: async (request) => { authorized = false; return fixture.receipt(request); } });
  const messages = fixture.flow();
  try {
    await fixture.applyFlow(runtime, messages.slice(0, 2));
    await assert.rejects(runtime.apply(messages[2]), /authority revoked/);
    assert.equal(runtime.history().length, 2);
    assert.equal(runtime.state(messages[0]).status, 'challenged');
    await assert.rejects(runtime.apply(messages[0]), /authority rejected/);
  } finally { runtime.close(); }
}

async function immutableCallbacks() {
  const runtime = fixture.conversation({ verifyAttestation: async (request) => {
    assert.throws(() => { request.presentation.payload.identity.agentId = 'changed'; }, TypeError);
    return fixture.receipt(request);
  } });
  try { await fixture.applyFlow(runtime, fixture.flow()); }
  finally { runtime.close(); }
}

async function asynchronousFreshness() {
  let now = fixture.NOW;
  const expired = fixture.conversation({ clock: () => now, verifyAttestation: async (request) => {
    now = '2026-11-02T10:02:00.000Z';
    return fixture.receipt(request);
  } });
  const messages = fixture.flow();
  try {
    await fixture.applyFlow(expired, messages.slice(0, 2));
    await assert.rejects(expired.apply(messages[2]), /challenge expired/);
    assert.equal(expired.state(messages[0]).status, 'challenged');
  } finally { expired.close(); }
}

async function concurrentState() {
  let runtime;
  runtime = fixture.conversation({ verifyAttestation: async (request) => {
    const concurrent = fixture.flow({ conversationId: 'concurrent-session' });
    await runtime.apply(concurrent[0]);
    return fixture.receipt(request);
  } });
  const messages = fixture.flow();
  try {
    await fixture.applyFlow(runtime, messages.slice(0, 2));
    await assert.rejects(runtime.apply(messages[2]), /state changed/);
    assert.equal(runtime.state(messages[0]).status, 'challenged');
    assert.equal(runtime.history().length, 3);
  } finally { runtime.close(); }
}

async function main() {
  assert.throws(() => new RecognitionConversation({}), /authorize callback/);
  assert.throws(() => new RecognitionConversation({ authorize() {} }), /verifyAttestation callback/);
  assert.throws(() => fixture.conversation({ maxChallengeTtlMs: 0 }), /TTL/);
  await durableRecognition();
  await relationSemantics();
  await invalidRelations();
  await wrongBindings();
  await rejectedReceipts();
  await nonceAndExpiry();
  await authorityAndRace();
  await immutableCallbacks();
  await asynchronousFreshness();
  await concurrentState();
  console.log('CONTINUITY recognition, durable nonces, bound attestations and preserved history: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
