'use strict';

const assert = require('assert');
const registry = require('../src/services/ontogenesis/canonicalConceptRegistry');
const runtimeRegistry = require('../src/services/conceptRegistryService');

const health = registry.registryHealth();
assert.ok(health.domains >= 23);
assert.ok(health.concepts >= 180);
assert.ok(health.concepts >= 400);
assert.ok(health.capabilities > 0);

const web = registry.resolveMission({ objective: 'Créer un site React avec vérification et récupération',
  profile: { stack: ['react'] }, topology: 'a_team' });
assert.ok(web.domains.includes('orchestration'));
assert.ok(web.domains.includes('epistemology'));
assert.ok(web.operational.length > 0);
assert.ok(web.unavailable.length > 0);
assert.ok(web.canonicalConcepts.length >= 400);
assert.ok(web.runtimeConcepts.length >= 180);
assert.ok(web.runtimeConcepts.every((concept) => Array.isArray(concept.implementedPrimitives)));
assert.ok(web.runtimeConcepts.every((concept) => Array.isArray(concept.unavailablePrimitives)));
assert.ok(web.runtimeConcepts.every((concept) => concept.unavailablePrimitives.length === 0));
assert.ok(web.runtimeConcepts.filter((concept) => concept.primitives.length > 0)
  .every((concept) => concept.executable));
assert.ok(web.runtimeLeaseCandidates.length > 0);
assert.ok(web.runtimeLeaseCandidates.every((entry) => !entry.tools.includes('genos_orchestrate')));
const compatibleTools = new Set(runtimeRegistry.resolveCapabilities(web.compatibleRuntimeConcepts.map((concept) => concept.id)));
assert.ok(web.runtimeLeaseCandidates.every((entry) =>
  entry.tools.some((tool) => compatibleTools.has(tool))));
assert.strictEqual(web.strategy.id, 'minimal_patch');
assert.ok(web.compatibleRuntimeConcepts.length > 0);
assert.ok(web.selectedConcepts.some((concept) => concept.id === 'mission'));
assert.strictEqual(web.failClosed, true);

console.log('ontogenesis canonical concept registry checks passed.');
