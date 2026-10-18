'use strict';

const assert = require('assert');
const svc = require('../src/services/methodContractService');

const contract = svc.buildMethodContract({
  methodId: 'm1',
  methodName: 'run_strategy',
  parameters: { strategyId: 's1' },
  preconditions: [{ id: 'p1', message: 'budget ok', satisfied: () => true }],
  budget: { max_tokens: 1000 }
});

assert.strictEqual(contract.schema, 'genos.method-contract/v1');
assert.strictEqual(contract.status, 'draft');
assert.strictEqual(contract.method_id, 'm1');

const bound = svc.bindMethodContract(contract, { budget: { max_tokens: 2000 } });
assert.strictEqual(bound.status, 'bound');
assert.strictEqual(bound.version, 2);
assert.strictEqual(bound.budget.max_tokens, 2000);

const result = svc.executeMethodContract(bound, {});
assert.ok(result.ok);
assert.strictEqual(result.contract.status, 'executed');
assert.ok(result.contract.receipt);

const violated = svc.executeMethodContract(
  svc.bindMethodContract(svc.buildMethodContract({ preconditions: [{ id: 'p1', message: 'fail', satisfied: () => false }] }), {}),
  {}
);
assert.ok(!violated.ok);
assert.strictEqual(violated.contract.status, 'violated');

const revoked = svc.revokeMethodContract(result.contract);
assert.strictEqual(revoked.status, 'revoked');

console.log('✓ methodContractService tests passed');
