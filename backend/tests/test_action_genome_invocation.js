const assert = require('assert/strict');
const { validGenome } = require('./test_action_genome_contract');
const { evaluateInvocation } = require('../src/services/actionGenome/actionInvocation');

function context() {
  return {
    genome: validGenome(),
    invocation: {
      actor: { id: 'agent-builder' },
      permissions: ['topology_read'],
      leases: ['genos_topology_session'],
      budget: { maxDurationMs: 1000, maxCostUnits: 0.5 },
      observedStateVersion: 'revision:7',
      input: { sessionId: 'sync-1' }
    },
    state: { version: 'revision:7', snapshot: { revision: 7 } }
  };
}

const accepted = evaluateInvocation(context());
assert.equal(accepted.statement.admitted, true);
assert.equal(accepted.statement.actorId, 'agent-builder');
assert.equal(accepted.statement.observedStateVersion, 'revision:7');
assert.equal(accepted.statement.evidenceStatus, 'pending_execution');
assert.match(accepted.receiptId, /^sha256:[a-f0-9]{64}$/);

const repeated = evaluateInvocation(context());
assert.equal(repeated.receiptId, accepted.receiptId, 'same causal statement must have a stable receipt id');

const stale = context();
stale.invocation.observedStateVersion = 'revision:6';
const deniedStale = evaluateInvocation(stale);
assert.equal(deniedStale.statement.admitted, false);
assert.equal(deniedStale.statement.verdicts.find((item) => item.gate === 'state_version').passed, false);

const noLease = context();
noLease.invocation.leases = [];
assert.equal(evaluateInvocation(noLease).statement.admitted, false);

const unknown = context();
unknown.invocation.executeAnyway = true;
assert.throws(() => evaluateInvocation(unknown), { code: 'ACTION_INVOCATION_INVALID' });

console.log('ActionGenome invocation admission and causal receipts passed.');
