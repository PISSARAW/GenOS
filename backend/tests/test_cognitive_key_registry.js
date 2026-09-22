'use strict';

const assert = require('node:assert/strict');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');
const {
  normalizeKey,
  validateRegistry,
  registryHealth,
  resolveProvenance,
  unusedOperations
} = require('../src/cognition/cognitiveKeyRegistry');

function baseKey() {
  return { ...COGNITIVE_KEYS[0] };
}

function assertInvalid(keys, expectedMessage) {
  const result = validateRegistry(keys);
  assert.equal(result.valid, false, 'expected registry to be invalid');
  assert.ok(
    result.errors.some((error) => error.includes(expectedMessage)),
    `expected error containing '${expectedMessage}', got: ${result.errors.join('; ')}`
  );
}

// 1. Santé du registre réel
const health = registryHealth();
assert.equal(health.valid, true, health.errors.join('; '));
assert.equal(health.keyCount, COGNITIVE_KEYS.length);
assert.deepEqual(health.duplicateIds, []);
assert.deepEqual(health.errors, []);

// 2. Normalisation
const normalized = COGNITIVE_KEYS.map(normalizeKey);
assert.ok(normalized.every((key) => key.apiVersion === 'genos.cognition/v1'));
assert.ok(normalized.every((key) => key.kind === 'CognitiveKey'));
assert.ok(normalized.every((key) => Array.isArray(key.questions)));

// 3. Unicité des IDs
const ids = COGNITIVE_KEYS.map((key) => key.id);
assert.equal(new Set(ids).size, ids.length);

// 4. Couverture du vocabulaire d'opérations (anti-décoratif)
assert.deepEqual(unusedOperations(normalized), []);

// 5. Indépendance doctrinale
assertInvalid(
  [{ ...baseKey(), instruction: 'Penser comme Kant en separates couches et cadres de representation.' }],
  'doctrine terms'
);
assertInvalid(
  [{ ...baseKey(), label: 'Analyse deleuzienne du probleme' }],
  'doctrine terms'
);

// 6. Champs requis
assertInvalid([{ ...baseKey(), id: 'not-a-cognitive-id' }], 'dash-segment pattern');
assertInvalid([{ ...baseKey(), instruction: 'Trop court.' }], 'at least 40 characters');
assertInvalid([{ ...baseKey(), failureModes: [] }], 'non-empty array');
assertInvalid([{ ...baseKey(), derivedFrom: [] }], 'non-empty array');
assertInvalid([baseKey(), baseKey()], 'duplicate key ids');

// 7. Intégrité croisée
assertInvalid(
  [{ ...baseKey(), compatibleWith: ['cognitive.does-not-exist'] }],
  'unknown key'
);
assertInvalid(
  [{ ...baseKey(), conflictsWith: ['cognitive.does-not-exist'] }],
  'unknown key'
);

// 8. Provenance souple : un ID de concept inexistant n'invalide pas
//    (référentiel de concepts synthétique pour un test déterministe :
//     le registre réel évolue en parallèle, seule la softness est un invariant)
const mutated = COGNITIVE_KEYS.map((key, index) => (
  index === 0 ? { ...key, derivedFrom: ['concept.missing-xyz'] } : key
));
const softProvenance = validateRegistry(mutated);
assert.equal(softProvenance.valid, true, 'soft provenance must not invalidate');
const syntheticIds = ['causality.hume-regularity'];
const provenance = resolveProvenance(mutated, syntheticIds);
assert.equal(provenance.available, true);
assert.equal(provenance.resolved.length, 1);
assert.equal(provenance.resolved[0].concept, 'causality.hume-regularity');
assert.ok(provenance.unresolved.some((entry) => entry.concept === 'concept.missing-xyz'));

// 9. Provenance réelle : information uniquement (jamais un échec de test)
const realProvenance = health.provenance;
assert.equal(typeof realProvenance.available, 'boolean');
console.log(
  `Cognitive key registry tests passed (${health.keyCount} keys, ` +
  `real provenance: ${realProvenance.resolved.length}/${realProvenance.resolved.length + realProvenance.unresolved.length} refs resolved).`
);
if (realProvenance.unresolved.length) {
  console.log('Provenance warnings (informatif, registre de concepts en évolution) :');
  realProvenance.unresolved.forEach((entry) => {
    console.log(`  - ${entry.key} → ${entry.concept}`);
  });
}
