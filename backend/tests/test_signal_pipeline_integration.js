/**
 * Pipeline integration test — persist → coalesce → receptor → plasticity
 */

const assert = require('assert');
const receptor = require('../src/services/signalReceptorService');
const plasticity = require('../src/services/synapticPlasticityService');
const signalCoalescer = require('../src/services/signalCoalescerService');
const signalEventBus = require('../src/services/signalEventBus');

function resetAll() {
  receptor.listReceptors().forEach((r) => receptor.unregisterReceptor(r.id));
  plasticity.resetWeights();
  // Note: coalescer has no reset but uses time-based cleanup
}

async function testFullPipelineReceptorTriggers() {
  resetAll();

  const busEvents = [];
  signalEventBus.onSignal((s) => busEvents.push(s));

  // Register a receptor
  const actionLog = [];
  receptor.registerReceptor({
    id: 'integration-receptor-1',
    targetLigand: 'TEST_READY',
    threshold: 0.8,
    action: 'emit_signal',
    actionData: {
      signalType: 'ligand',
      topic: 'test-ready',
      signalData: { triggered: true },
    },
  });

  // Simulate signal matching
  const signal = {
    signalId: 'sig-int-1',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };

  // 1. Match receptors
  const triggered = receptor.matchReceptors(signal);
  assert.strictEqual(triggered.length, 1);
  console.log('[PASS] Receptor triggers on matching signal');

  // 2. Dispatch actions
  const ctx = {
    publishSignal: async (params) => ({ signalId: 'sig-cascade', published: true }),
  };
  const dispatched = await receptor.dispatchActions(triggered, signal, ctx);
  assert.strictEqual(dispatched.length, 1);
  assert.strictEqual(dispatched[0].executed, true);
  console.log('[PASS] Action dispatched successfully');

  // 3. Update plasticity
  plasticity.recordSignalOutcome({
    senderId: signal.senderAgentId,
    receiverId: 'worker-b',
    outcome: dispatched[0].executed ? 'receptor_triggered' : 'no_effect',
    signalType: signal.signalType,
  });
  const channelWeight = plasticity.getChannelWeight('worker-a', 'worker-b');
  assert.ok(channelWeight.weight > plasticity.DEFAULT_WEIGHT);
  console.log('[PASS] Plasticity reinforced after successful dispatch');

  // 4. Verify coalescer allows second signal after time gap
  signalCoalescer.coalesce({ signalId: 'sig-1', signalType: 'ligand', topic: 't1', senderAgentId: 'a' });
  const second = signalCoalescer.coalesce({ signalId: 'sig-2', signalType: 'ligand', topic: 't2', senderAgentId: 'b' });
  assert.ok(second !== null, 'Different sender+topic should pass coalescer');
  console.log('[PASS] Coalescer allows signals from different senders');

  signalEventBus.removeAllListeners();
}

function testPipelineCoalescedSignal() {
  resetAll();

  // Same sender+topic → second signal suppressed
  signalCoalescer.coalesce({ signalId: 'c1', signalType: 'ligand', topic: 'same', senderAgentId: 'sender-a' });
  const suppressed = signalCoalescer.coalesce({ signalId: 'c2', signalType: 'ligand', topic: 'same', senderAgentId: 'sender-a' });
  assert.strictEqual(suppressed, null);
  console.log('[PASS] Coalescer suppresses duplicate signal');

  // Plasticity updated for suppressed
  plasticity.recordSignalOutcome({ senderId: 'sender-a', receiverId: null, outcome: 'suppressed', signalType: 'ligand' });
  const weight = plasticity.getChannelWeight('sender-a', null);
  assert.ok(weight.weight < plasticity.DEFAULT_WEIGHT);
  console.log('[PASS] Plasticity suppressed outcome recorded');
}

function testFullPipelineNoReceptorMatch() {
  resetAll();

  // Signal with no matching receptor
  const signal = {
    signalId: 'sig-orphan',
    signalType: 'ligand',
    semanticType: 'UNKNOWN',
    concentration: 0.5,
    topic: 'unknown',
    senderAgentId: 'worker-x',
  };

  const triggered = receptor.matchReceptors(signal);
  assert.strictEqual(triggered.length, 0);

  // When no receptor matches → LLM required
  const result = { llmRequired: triggered.length === 0 };
  assert.strictEqual(result.llmRequired, true);
  console.log('[PASS] No receptor match → LLM required');

  // Plasticity: no effect
  plasticity.recordSignalOutcome({ senderId: 'worker-x', receiverId: 'worker-y', outcome: 'no_effect', signalType: signal.signalType });
  const weight = plasticity.getChannelWeight('worker-x', 'worker-y');
  assert.ok(weight.weight < plasticity.DEFAULT_WEIGHT);
  console.log('[PASS] No-effect outcome depresses channel');
}

async function run() {
  testFullPipelineReceptorTriggers();
  testPipelineCoalescedSignal();
  testFullPipelineNoReceptorMatch();
  console.log('\nAll pipeline integration tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
