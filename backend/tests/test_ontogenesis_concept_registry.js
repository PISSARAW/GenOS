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
  profile: { stack: ['react'] }, topology: 'a_team',
  requestedConcepts: ['morphogenese', 'genos_browser_act', 'core.self', 'concept_inexistant'] });
assert.ok(web.domains.includes('orchestration'));
assert.ok(web.domains.includes('epistemology'));
assert.ok(web.operational.length > 0);
assert.ok(web.unavailable.length > 0);
assert.ok(web.canonicalConcepts.length >= 400);
assert.ok(web.canonicalConcepts.filter((concept) => concept.source === 'philosophy_registry').length >= 375);
assert.ok(web.runtimeConcepts.length >= 180);
assert.ok(web.runtimeConcepts.every((concept) => Array.isArray(concept.implementedPrimitives)));
assert.ok(web.runtimeConcepts.every((concept) => Array.isArray(concept.unavailablePrimitives)));
assert.ok(web.runtimeConcepts.every((concept) => concept.unavailablePrimitives.length === 0));
assert.ok(web.runtimeConcepts.filter((concept) => concept.primitives.length > 0)
  .every((concept) => concept.executable));
assert.deepStrictEqual(web.resolvedConcepts.map((concept) => concept.source), ['documentation', 'runtime', 'philosophy', 'unknown']);
assert.strictEqual(web.resolvedConcepts[0].reason, 'concept-documentaire-sans-raccord-runtime');
assert.strictEqual(web.resolvedConcepts[1].executable, true);
assert.strictEqual(web.resolvedConcepts[2].access, 'read');
assert.strictEqual(web.blockedConcepts.length, 2);
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
