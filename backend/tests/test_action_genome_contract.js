const assert = require('assert/strict');
const { assertActionGenome, validationResult } = require('../src/services/actionGenome/actionGenomeValidator');

function validGenome() {
  return {
    schema: 'genos.action-genome/v1',
    identity: { id: 'syncytium.session.inspect', version: '1.0.0', description: 'Inspecte une session sans la modifier.' },
    contract: {
      inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } },
      outputSchema: { type: 'object' },
      preconditions: [{ path: '/state/revision', operator: 'gte', value: 0 }],
      postconditions: [{ path: '/result/sessionId', operator: 'exists', value: true }],
      state: { reads: ['/syncytium/session/*'], writes: [] },
      effects: [{ kind: 'read', target: 'syncytium.session' }]
    },
    authority: { permissions: ['topology_read'], leases: ['genos_topology_session'] },
    budget: { maxDurationMs: 5000, maxCostUnits: 1 },
    reversibility: { mode: 'not_applicable', blastRadius: 'none', compensation: null },
    evidence: { expected: ['topology-session-receipt'] }
  };
}

assert.equal(validationResult(validGenome()).valid, true);

const incomplete = validGenome();
delete incomplete.authority.leases;
const missingResult = validationResult(incomplete);
assert.equal(missingResult.valid, false);
assert.ok(missingResult.errors.some((error) => error.keyword === 'required'));

const widened = validGenome();
widened.authority.unbounded = true;
assert.equal(validationResult(widened).valid, false, 'unknown authority fields must fail closed');

assert.throws(() => assertActionGenome(widened), (error) => {
  assert.equal(error.code, 'ACTION_GENOME_INVALID');
  assert.equal(error.status, 400);
  return true;
});

console.log('ActionGenome contract validation passed.');

module.exports = { validGenome };
