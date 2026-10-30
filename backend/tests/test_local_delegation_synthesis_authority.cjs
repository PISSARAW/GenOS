'use strict';
const assert = require('node:assert/strict');
const plans = require('../src/services/localModelDelegation');
const authority = require('../src/services/missionEnvelopeAuthority');
const dispatch = require('../src/services/agents/subOrchestratorDispatchService');
const store = require('../src/services/biologicalWorkerStore');
const kinds = require('../src/services/agents/workerKindService');

async function scenario(revoke) {
  const original = { authority: authority.assertRun, dispatch: dispatch.dispatchLocalModelChild, receipt: store.receipt };
  let revoked = false; let generations = 0; let checks = 0;
  authority.assertRun = async () => {
    checks += 1;
    if (revoked) throw Object.assign(new Error('Mission lease revoked.'), { code: 'MISSION_AUTHORITY_STALE' });
  };
  dispatch.dispatchLocalModelChild = async () => {
    revoked = revoke;
    return { childAgentId: 'child', status: 'completed', supervision: { evidenceReport: { outcome: 'success' } } };
  };
  store.receipt = async () => ({ receiptId: 'receipt', result: { verified: false } });
  const contract = kinds.grantBoundedDelegation(kinds.buildWorkerContract('sub_orchestrator', { workerTokenLimit: 10000 }));
  const ctx = { db: { async get() { return { id: 'child-run' }; } },
    mission: { agentId: 'sub', missionId: 'mission', executionBudget: { tokens: 10000 }, workerContract: contract },
    executionRun: { id: 'sub-run' }, latencyMs: 60000, maxTokens: 1000, promptText: 'Coordinate.' };
  const generate = async () => {
    generations += 1;
    return { text: generations === 1 ? JSON.stringify({ children: [{ workerKind: 'bounded_worker',
      mission: 'Observe.', modelTokens: 1000, mode: 'analysis', dependsOn: -1 }] }) : '{"outcome":"unresolved"}',
    inputTokens: 10, outputTokens: 10, costUsd: 0 };
  };
  try {
    if (revoke) await assert.rejects(plans.generate(ctx, generate), { code: 'MISSION_AUTHORITY_STALE' });
    else await plans.generate(ctx, generate);
    assert.equal(generations, revoke ? 1 : 2, 'revoked authority cannot call the synthesis provider');
    assert.equal(checks, 2, 'the authority is checked before planning and again after children');
  } finally {
    authority.assertRun = original.authority; dispatch.dispatchLocalModelChild = original.dispatch; store.receipt = original.receipt;
  }
}
(async () => { await scenario(false); await scenario(true); console.log('Delegation synthesis requires current mission authority: PASS'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
