/**
 * Tests du Signal Receptor Service.
 *
 * Vérifie le pipeline Signal → Receptor → Action sans LLM.
 */

const assert = require('assert');
const receptor = require('../src/services/signalReceptorService');

function resetReceptors() {
  for (const id of receptor.listReceptors().map((r) => r.id)) {
    receptor.unregisterReceptor(id);
  }
}

async function testRegisterAndList() {
  resetReceptors();

  receptor.registerReceptor({
    id: 'receptor-test-1',
    targetLigand: 'TEST_READY',
    threshold: 0.8,
    action: 'emit_signal',
    actionData: { signalType: 'ligand', topic: 'test-ready' },
    description: 'Test receptor',
  });

  const list = receptor.listReceptors();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, 'receptor-test-1');
  assert.strictEqual(list[0].enabled, true);

  const filtered = receptor.listReceptors({ targetLigand: 'TEST_READY' });
  assert.strictEqual(filtered.length, 1);

  const empty = receptor.listReceptors({ targetLigand: 'UNKNOWN' });
  assert.strictEqual(empty.length, 0);
}

async function testMatchTriggers() {
  resetReceptors();

  receptor.registerReceptor({
    id: 'receptor-match-1',
    targetLigand: 'TEST_READY',
    threshold: 0.8,
    action: 'emit_signal',
  });

  // Signal above threshold → triggers
  const signalHigh = {
    signalId: 'sig-1',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };
  const triggeredHigh = receptor.matchReceptors(signalHigh);
  assert.strictEqual(triggeredHigh.length, 1);
  assert.strictEqual(triggeredHigh[0].receptor.id, 'receptor-match-1');
  assert.strictEqual(triggeredHigh[0].cascadeSignal, 'emit_signal');

  // Signal below threshold → no trigger
  const signalLow = {
    signalId: 'sig-2',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.5,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };
  const triggeredLow = receptor.matchReceptors(signalLow);
  assert.strictEqual(triggeredLow.length, 0);

  // Signal with wrong ligand → no trigger
  const signalWrong = {
    signalId: 'sig-3',
    signalType: 'ligand',
    semanticType: 'OTHER_SIGNAL',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };
  const triggeredWrong = receptor.matchReceptors(signalWrong);
  assert.strictEqual(triggeredWrong.length, 0);
}

async function testMatchAndDispatchNoLLM() {
  resetReceptors();

  const dispatchedCalls = [];
  receptor.registerReceptor({
    id: 'receptor-dispatch-1',
    targetLigand: 'TEST_READY',
    threshold: 0.8,
    action: 'emit_signal',
    actionData: { signalType: 'ligand', topic: 'test-ready', signalData: { cascade: true } },
  });

  const ctx = {
    publishSignal: async (params) => {
      dispatchedCalls.push(params);
      return { signalId: 'sig-cascade', published: true, signalType: params.signalType };
    },
  };

  const signal = {
    signalId: 'sig-trigger',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };

  const result = await receptor.matchAndDispatch(signal, ctx);

  assert.strictEqual(result.triggered.length, 1);
  assert.strictEqual(result.triggered[0], 'receptor-dispatch-1');
  assert.strictEqual(result.dispatched.length, 1);
  assert.strictEqual(result.dispatched[0].executed, true);
  assert.strictEqual(result.dispatched[0].action, 'emit_signal');
  assert.strictEqual(result.llmRequired, false, 'LLM should NOT be required when receptor triggers');

  assert.strictEqual(dispatchedCalls.length, 1);
  assert.strictEqual(dispatchedCalls[0].signalType, 'ligand');
  assert.strictEqual(dispatchedCalls[0].topic, 'test-ready');
  assert.strictEqual(dispatchedCalls[0].signalData.triggeredBy, 'sig-trigger');
}

async function testMatchAndDispatchLLMRequired() {
  resetReceptors();

  const ctx = {
    publishSignal: async () => ({ signalId: 'sig-x', published: true }),
  };

  // No receptors registered → LLM required
  const signal = {
    signalId: 'sig-orphan',
    signalType: 'ligand',
    semanticType: 'UNKNOWN_SIGNAL',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };

  const result = await receptor.matchAndDispatch(signal, ctx);
  assert.strictEqual(result.triggered.length, 0);
  assert.strictEqual(result.dispatched.length, 0);
  assert.strictEqual(result.llmRequired, true, 'LLM required when no receptor matches');
}

async function testDisabledReceptor() {
  resetReceptors();

  receptor.registerReceptor({
    id: 'receptor-disabled-1',
    targetLigand: 'TEST_READY',
    threshold: 0.5,
    action: 'emit_signal',
    enabled: false,
  });

  const signal = {
    signalId: 'sig-d',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
  };

  const triggered = receptor.matchReceptors(signal);
  assert.strictEqual(triggered.length, 0, 'Disabled receptor should not trigger');
}

async function testTargetAgentFilter() {
  resetReceptors();

  receptor.registerReceptor({
    id: 'receptor-targeted-1',
    targetLigand: 'TEST_READY',
    threshold: 0.5,
    targetAgentId: 'orch-alpha',
    action: 'emit_signal',
  });

  // Signal destiné à l'agent ciblé (destinataire, pas émetteur)
  const signalMatch = {
    signalId: 'sig-m',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'worker-a',
    recipientAgentId: 'orch-alpha',
  };
  assert.strictEqual(receptor.matchReceptors(signalMatch).length, 1);

  // Signal d'un autre destinataire : pas de match même si l'émetteur colle
  const signalNoMatch = {
    signalId: 'sig-nm',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'orch-alpha',
    recipientAgentId: 'orch-beta',
  };
  assert.strictEqual(receptor.matchReceptors(signalNoMatch).length, 0);

  // Sans destinataire déclaré, un récepteur ciblé ne matche pas
  const signalOrphan = {
    signalId: 'sig-or',
    signalType: 'ligand',
    semanticType: 'TEST_READY',
    concentration: 0.95,
    topic: 'auth',
    senderAgentId: 'orch-alpha',
  };
  assert.strictEqual(receptor.matchReceptors(signalOrphan).length, 0);
}

async function testUpdateAgentAction() {
  resetReceptors();

  const updateCalls = [];
  receptor.registerReceptor({
    id: 'receptor-update-1',
    targetLigand: 'MISSION_COMPLETE',
    threshold: 0.9,
    action: 'update_agent',
    actionData: { agentId: 'worker-a', status: 'completed', currentTask: 'done' },
  });

  const ctx = {
    updateAgent: async (agentId, status, currentTask) => {
      updateCalls.push({ agentId, status, currentTask });
    },
  };

  const signal = {
    signalId: 'sig-update',
    signalType: 'ligand',
    semanticType: 'MISSION_COMPLETE',
    concentration: 0.95,
    topic: 'mission',
    senderAgentId: 'worker-a',
  };

  const result = await receptor.matchAndDispatch(signal, ctx);
  assert.strictEqual(result.llmRequired, false);
  assert.strictEqual(updateCalls.length, 1);
  assert.strictEqual(updateCalls[0].agentId, 'worker-a');
  assert.strictEqual(updateCalls[0].status, 'completed');
}

async function testInvalidReceptor() {
  // Missing id
  assert.throws(
    () => receptor.registerReceptor({ targetLigand: 'X', action: 'emit_signal' }),
    /must have an id/
  );

  // Missing targetLigand
  assert.throws(
    () => receptor.registerReceptor({ id: 'bad', action: 'emit_signal' }),
    /must have a targetLigand/
  );

  // Unsupported action
  assert.throws(
    () => receptor.registerReceptor({ id: 'bad', targetLigand: 'X', action: 'nonexistent' }),
    /Unsupported receptor action/
  );
}

async function run() {
  await testRegisterAndList();
  console.log('[PASS] register / list receptors');

  await testMatchTriggers();
  console.log('[PASS] match receptors triggers correctly');

  await testMatchAndDispatchNoLLM();
  console.log('[PASS] matchAndDispatch — no LLM when receptor triggers');

  await testMatchAndDispatchLLMRequired();
  console.log('[PASS] matchAndDispatch — LLM required when no match');

  await testDisabledReceptor();
  console.log('[PASS] disabled receptors do not trigger');

  await testTargetAgentFilter();
  console.log('[PASS] targetAgentId filter works');

  await testUpdateAgentAction();
  console.log('[PASS] update_agent action dispatches correctly');

  await testInvalidReceptor();
  console.log('[PASS] invalid receptor registration rejected');

  console.log('\nTous les tests du Signal Receptor Service sont passés.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
