/**
 * Tests for Signal Event Bus and Coalescer.
 *
 * Verifies push model (event-driven) and anti-spam (coalescing + refractory).
 */

const assert = require('assert');
const bus = require('../src/services/signalEventBus');
const coalescer = require('../src/services/signalCoalescerService');

async function testEventBusPublishAndSubscribe() {
  const received = [];
  const handler = (signal) => received.push(signal);
  bus.onSignal(handler);

  bus.publish({ signalId: 'sig-1', signalType: 'voltage', topic: 'auth', senderAgentId: 'a' });

  // Give event loop a tick to deliver
  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].signalId, 'sig-1');
  assert.strictEqual(received[0].signalType, 'voltage');

  bus.removeListener('signal', handler);
}

async function testEventBusTypedSubscription() {
  const voltageSignals = [];
  bus.onSignalType('voltage', (s) => voltageSignals.push(s));
  bus.onSignalType('ligand', () => {});

  bus.publish({ signalId: 's1', signalType: 'voltage', topic: 't1', senderAgentId: 'a' });
  bus.publish({ signalId: 's2', signalType: 'ligand', topic: 't2', senderAgentId: 'b' });

  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(voltageSignals.length, 1);
  assert.strictEqual(voltageSignals[0].signalId, 's1');

  bus.removeAllListeners();
}

async function testEventBusTopicFilter() {
  const authSignals = [];
  bus.onTopic('auth', (s) => authSignals.push(s));
  bus.onTopic('mission', () => {});

  bus.publish({ signalId: 's1', signalType: 'ligand', topic: 'auth', senderAgentId: 'a' });
  bus.publish({ signalId: 's2', signalType: 'voltage', topic: 'mission', senderAgentId: 'b' });

  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(authSignals.length, 1);
  assert.strictEqual(authSignals[0].topic, 'auth');

  bus.removeAllListeners();
}

async function testEventBusAgentFilter() {
  const agentASignals = [];
  bus.onAgent('agent-a', (s) => agentASignals.push(s));
  bus.onAgent('agent-b', () => {});

  bus.publish({ signalId: 's1', signalType: 'ligand', topic: 't', senderAgentId: 'agent-a' });
  bus.publish({ signalId: 's2', signalType: 'voltage', topic: 't', senderAgentId: 'agent-b' });

  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(agentASignals.length, 1);
  assert.strictEqual(agentASignals[0].senderAgentId, 'agent-a');

  bus.removeAllListeners();
}

function resetCoalescer() {
  if (coalescer.clearAllCoalescerState) coalescer.clearAllCoalescerState();
}

async function testCoalescerSuppressesDuplicate() {
  resetCoalescer();
  const senderA = 'agent-a';
  const topic = 'status-' + Date.now();

  const sig1 = { signalId: 's1', signalType: 'ligand', topic, senderAgentId: senderA, signalData: {} };
  const sig2 = { signalId: 's2', signalType: 'ligand', topic, senderAgentId: senderA, signalData: {} };

  const result1 = coalescer.coalesce(sig1, { refractoryMs: 2000, coalesceMs: 500 });
  assert.ok(result1 !== null, 'First signal should pass');

  const result2 = coalescer.coalesce(sig2, { refractoryMs: 2000, coalesceMs: 500 });
  assert.strictEqual(result2, null, 'Immediate duplicate should be suppressed');
}

async function testCoalescerAllowsAfterRefractory() {
  resetCoalescer();
  const senderA = 'agent-a';
  const topic = 'status-' + Date.now();

  const sig1 = { signalId: 's1', signalType: 'ligand', topic, senderAgentId: senderA, signalData: {} };
  coalescer.coalesce(sig1, { refractoryMs: 10, coalesceMs: 5 });

  await new Promise(resolve => setTimeout(resolve, 20));

  const sig2 = { signalId: 's2', signalType: 'ligand', topic, senderAgentId: senderA, signalData: {} };
  const result2 = coalescer.coalesce(sig2, { refractoryMs: 10, coalesceMs: 5 });
  assert.ok(result2 !== null, 'Signal after refractory should pass');
}

async function testCoalescerDifferentTopics() {
  resetCoalescer();
  const senderA = 'agent-a';
  const stamp = Date.now();

  const sig1 = { signalId: 's1', signalType: 'ligand', topic: 'auth-' + stamp, senderAgentId: senderA, signalData: {} };
  coalescer.coalesce(sig1, { refractoryMs: 5000 });

  const sig2 = { signalId: 's2', signalType: 'ligand', topic: 'mission-' + stamp, senderAgentId: senderA, signalData: {} };
  const result2 = coalescer.coalesce(sig2, { refractoryMs: 5000 });
  assert.ok(result2 !== null, 'Signal on different topic should pass');
}

async function testCoalescerDifferentSenders() {
  resetCoalescer();
  const topic = 'auth-' + Date.now();

  const sig1 = { signalId: 's1', signalType: 'ligand', topic, senderAgentId: 'a', signalData: {} };
  const first = coalescer.coalesce(sig1, { refractoryMs: 0, coalesceMs: 60000 });
  assert.ok(first !== null, 'First sender passes and opens window');

  const sig2 = { signalId: 's2', signalType: 'ligand', topic, senderAgentId: 'b', signalData: {} };
  const result2 = coalescer.coalesce(sig2, { refractoryMs: 0, coalesceMs: 60000 });
  assert.ok(result2, 'Different sender emits independently');
  assert.strictEqual(coalescer.getBufferedCount(topic), 2, 'Each sender has a separate buffer');
  const firstGroup = coalescer.flushAndAggregate(topic);
  const secondGroup = coalescer.flushAndAggregate(topic);
  assert.strictEqual(firstGroup.coalescedCount, 1, 'Flush preserves first sender identity');
  assert.strictEqual(secondGroup.coalescedCount, 1, 'Flush preserves second sender identity');
}

function testDistinctScientificSignals() {
  resetCoalescer();
  const base = { signalType: 'ligand', topic: 'scientific-result', senderAgentId: 'researcher' };
  const first = coalescer.coalesce({ ...base, signalId: 'finding-a',
    signalData: { eventType: 'proof', artifactRef: 'claim-a', version: 1, idempotencyKey: 'proof-a-v1' } });
  const duplicate = coalescer.coalesce({ ...base, signalId: 'finding-a-copy',
    signalData: { eventType: 'proof', artifactRef: 'claim-a', version: 1, idempotencyKey: 'proof-a-v1' } });
  const other = coalescer.coalesce({ ...base, signalId: 'finding-b',
    signalData: { eventType: 'proof', artifactRef: 'claim-b', version: 1 } });
  const newer = coalescer.coalesce({ ...base, signalId: 'finding-a-v2',
    signalData: { eventType: 'proof', artifactRef: 'claim-a', version: 2 } });
  const otherSemanticRef = coalescer.coalesce({ ...base, signalId: 'finding-c',
    signalData: { eventType: 'proof', communicationEnvelope: { semanticRefs: ['claim-c'] } } });
  const nextSemanticRef = coalescer.coalesce({ ...base, signalId: 'finding-d',
    signalData: { eventType: 'proof', communicationEnvelope: { semanticRefs: ['claim-d'] } } });
  const revoked = coalescer.coalesce({ ...base, signalId: 'finding-a-retracted',
    signalData: { eventType: 'claim_retracted', artifactRef: 'claim-a', version: 2 } });
  const counterexampleA = coalescer.coalesce({ ...base, signalId: 'counterexample-a',
    signalData: { eventType: 'counterexample_validated', artifactRef: 'claim-a', version: 2,
      idempotencyKey: 'counterexample-batch', counterexampleResultId: 'counterexample-a', receiptDigest: 'sha256:a' } });
  const counterexampleB = coalescer.coalesce({ ...base, signalId: 'counterexample-b',
    signalData: { eventType: 'counterexample_validated', artifactRef: 'claim-a', version: 2,
      idempotencyKey: 'counterexample-batch', counterexampleResultId: 'counterexample-b', receiptDigest: 'sha256:b' } });
  const unkeyedA = coalescer.coalesce({ ...base, signalId: 'unkeyed-a',
    signalData: { eventType: 'finding', artifactRef: 'claim-a', version: 2 } });
  const unkeyedB = coalescer.coalesce({ ...base, signalId: 'unkeyed-b',
    signalData: { eventType: 'finding', artifactRef: 'claim-a', version: 2 } });
  assert.ok(first && other && newer && otherSemanticRef && nextSemanticRef && revoked,
    'Distinct artifacts, versions, semantic refs and revocations must pass');
  assert.ok(counterexampleA && counterexampleB, 'Distinct counterexample results must both pass');
  assert.ok(unkeyedA && unkeyedB, 'Referenced events without an idempotency key must both pass');
  assert.strictEqual(duplicate, null, 'Duplicate event/version is suppressed');
}

async function testCoalescerWindowExpires() {
  resetCoalescer();
  const topic = `expiring-${Date.now()}`;
  const opts = { refractoryMs: 0, coalesceMs: 5 };
  const first = coalescer.coalesce({ signalId: 'first', topic, senderAgentId: 'sender' }, opts);
  assert.strictEqual(first.coalescedCount, 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(coalescer.getBufferedCount(topic), 0, 'expired buffers are removed without another signal');
  const next = coalescer.coalesce({ signalId: 'next', topic, senderAgentId: 'sender' }, opts);
  assert.strictEqual(next.coalescedCount, 1, 'already published signals are not emitted twice');
}

async function testCheckRefractory() {
  const r1 = coalescer.checkRefractory('unknown', 'topic');
  assert.strictEqual(r1.allowed, true);
  assert.strictEqual(r1.remaining, 0);

  coalescer.recordEmission('agent-x', 'topic');
  const r2 = coalescer.checkRefractory('agent-x', 'topic');
  assert.strictEqual(r2.allowed, false);
  assert.ok(r2.remaining > 0);

  coalescer.recordEmission('agent-y', 'other');
  const r3 = coalescer.checkRefractory('agent-y', 'topic');
  assert.strictEqual(r3.allowed, true, 'Different topic should not block');
}

async function run() {
  await testEventBusPublishAndSubscribe();
  console.log('[PASS] EventBus publish and subscribe');

  await testEventBusTypedSubscription();
  console.log('[PASS] EventBus typed subscription (signalType)');

  await testEventBusTopicFilter();
  console.log('[PASS] EventBus topic filter');

  await testEventBusAgentFilter();
  console.log('[PASS] EventBus agent filter');

  await testCoalescerSuppressesDuplicate();
  console.log('[PASS] Coalescer suppresses duplicate');

  await testCoalescerAllowsAfterRefractory();
  console.log('[PASS] Coalescer allows after refractory period');

  await testCoalescerDifferentTopics();
  console.log('[PASS] Coalescer allows different topics');

  await testCoalescerDifferentSenders();
  console.log('[PASS] Coalescer separates different senders');

  testDistinctScientificSignals();
  console.log('[PASS] Distinct scientific signals survive coalescing');

  await testCoalescerWindowExpires();
  console.log('[PASS] Coalescer expires suppressed buffers');

  await testCheckRefractory();
  console.log('[PASS] checkRefractory works correctly');

  console.log('\nAll Signal Event Bus and Coalescer tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
