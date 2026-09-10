const assert = require('node:assert/strict');
const symbioteRuntime = require('../src/services/symbioteRuntimeService');
const biologicalModeService = require('../src/services/biologicalModeService');

assert.equal(symbioteRuntime.isHostRole('host_orchestrator'), true);
assert.equal(symbioteRuntime.isHostRole('specialist_symbiont'), false);
assert.equal(symbioteRuntime.isSymbioteRole('specialist_symbiont'), true);
assert.equal(symbioteRuntime.isSymbioteRole('immune_symbiont'), true);
assert.equal(symbioteRuntime.isSymbioteRole('memory_symbiont'), true);
assert.equal(symbioteRuntime.isSymbioteRole('host_orchestrator'), false);

assert.equal(symbioteRuntime.engineFor('host_orchestrator'), 'cloud');
assert.equal(symbioteRuntime.engineFor('specialist_symbiont'), 'local');
assert.equal(symbioteRuntime.engineFor('immune_symbiont'), 'local');
assert.equal(symbioteRuntime.engineFor('memory_symbiont'), 'local');
assert.equal(symbioteRuntime.engineFor('some_unrelated_role'), 'cloud');

// The Host never takes the local embedding path, even if it asks for one.
symbioteRuntime.embedForSymbiote('host_orchestrator', 'text').then((result) => {
  assert.equal(result.engine, 'cloud');
  assert.equal(result.embedding, null);
});

// JSON schema validation stays fully local and in-process (sub-millisecond, no network).
const schemaResult = symbioteRuntime.validateSchemaLocally(
  { name: 'ok' },
  { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }
);
assert.equal(schemaResult.engine, 'local');
assert.equal(schemaResult.valid, true);
assert.equal(typeof schemaResult.latencyMs, 'number');

const invalidSchemaResult = symbioteRuntime.validateSchemaLocally(
  {},
  { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }
);
assert.equal(invalidSchemaResult.valid, false);
assert.ok(invalidSchemaResult.errors.length > 0);

// Holobionte composition wires the Host to cloud and every Symbiont to the local runtime.
const holobionte = biologicalModeService.compose('holobionte', 'Deploy a critical security patch.');
assert.deepEqual(
  holobionte.map((member) => [member.role, member.engine]),
  [
    ['host_orchestrator', 'cloud'],
    ['specialist_symbiont', 'local'],
    ['immune_symbiont', 'local'],
    ['memory_symbiont', 'local']
  ]
);

// Other biological modes are unaffected: none of their roles match Symbiont names.
const biome = biologicalModeService.compose('biome', 'Explore the environment.');
assert.ok(biome.every((member) => member.engine === 'cloud'));

console.log('SymbioteRuntime asymmetric Holobionte routing checks passed.');
