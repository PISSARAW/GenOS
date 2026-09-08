const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const registry = require('../src/strategies/strategyRegistry');

(async () => {
  const plan = await adapter.executePrimitive('plan', { steps: [{ action: 'snapshot' }, { action: 'verify', dependsOn: ['step-1'] }] });
  assert.equal(plan.success, true);
  assert.equal(plan.plan.stepCount, 2);

  const probes = await adapter.executePrimitive('common_probes', {});
  assert.equal(probes.success, true);
  assert.equal(probes.count, 3);

  const evidence = await adapter.executePrimitive('evidence', { evidence: [{ id: 'test', value: 'passed' }] });
  assert.equal(evidence.success, true);
  const skipped = await adapter.executePrimitive('conditional_mutation', { evidence: [], minEvidence: 1 });
  assert.equal(skipped.success, false);
  assert.equal(skipped.code, 'EVIDENCE_REQUIRED');

  for (const id of ['plan_execute_verify', 'falsification_forks', 'controlled_probe', 'specialist_expert_committee']) {
    assert.equal(registry.getStrategy(id).missingPrimitives.length, 0, `${id} should be executable`);
  }
  console.log('Strategy planning primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });