'use strict';

const assert = require('node:assert/strict');
const { checkRateLimit } = require('../src/services/signalValidationUtils');
const receptor = require('../src/services/signalReceptorService');

async function main() {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const sender = `rate-reset-${now}`;
    for (let i = 0; i < 120; i++) assert.equal(checkRateLimit(sender), true);
    assert.equal(checkRateLimit(sender), false);
    now += 60_000;
    assert.equal(checkRateLimit(sender), true, 'the sender window resets after one minute');
  } finally {
    Date.now = originalNow;
  }

  const id = `truthful-${originalNow()}`;
  const signal = { signalId: 'signal-truth', signalType: 'ligand', semanticType: 'READY',
    concentration: 1, topic: 'ready', senderAgentId: 'sender' };
  try {
    receptor.registerReceptor({ id, targetLigand: 'READY', action: 'update_agent',
      actionData: { agentId: 'missing-agent', status: 'running' } });
    const failed = await receptor.matchAndDispatch(signal, { updateAgent: async () => ({ updated: false }) });
    assert.equal(failed.dispatched[0].executed, false);
    assert.equal(failed.llmRequired, true);
    const changed = await receptor.matchAndDispatch(signal, { updateAgent: async () => ({ updated: true }) });
    assert.equal(changed.dispatched[0].executed, true);
    receptor.unregisterReceptor(id);
    receptor.registerReceptor({ id, targetLigand: 'READY', action: 'change_organization',
      actionData: { organization: 'stigmergy' } });
    const unchanged = await receptor.matchAndDispatch(signal, {
      changeOrganization: async () => ({ changed: false, organization: 'stigmergy' })
    });
    assert.equal(unchanged.dispatched[0].executed, false);
    assert.equal(unchanged.llmRequired, true);
  } finally {
    receptor.unregisterReceptor(id);
  }
  console.log('signal truthful outcome tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
