'use strict';

const assert = require('node:assert/strict');
const {
  compileFromConcepts,
  compiledKeys,
  conceptsWithKeys
} = require('../src/cognition/cognitiveKeyCompiler');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');

const BASE_COUNT = COGNITIVE_KEYS.length;

function declaredKey(id, operation) {
  return {
    id,
    label: 'Clé déclarée de test',
    operation,
    instruction: 'Operation declarative valide pour le test du compilateur de cles cognitives.',
    questions: ['Question de sondage ?'],
    inputs: ['claim'],
    outputs: ['analysis'],
    usefulWhen: ['observational_uncertainty'],
    failureModes: ['test_failure_mode'],
    compatibleWith: [],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false
  };
}

// 1. Registre actuel : zéro concept ne déclare de clé (état de départ
//    honnête — la compilation est progressive, pas automatique)
assert.equal(conceptsWithKeys([]).length, 0);
const empty = compileFromConcepts([]);
assert.equal(empty.valid, true);
assert.equal(empty.compiledCount, 0);
assert.equal(empty.keys.length, BASE_COUNT);

// 2. Un concept déclare une clé valide → compilée, derivedFrom ajouté
const concept = {
  id: 'test.concept-with-key',
  cognitiveKeys: [declaredKey('cognitive.declared-test-key', 'boundary-probe')]
};
const compiled = compileFromConcepts([concept]);
assert.equal(compiled.valid, true, compiled.errors.join('; '));
assert.equal(compiled.compiledCount, 1);
assert.equal(compiled.keys.length, BASE_COUNT + 1);
const compiledKey = compiled.keys.find((key) => key.id === 'cognitive.declared-test-key');
assert.ok(compiledKey);
assert.deepEqual(compiledKey.derivedFrom, ['test.concept-with-key']);

// 3. Priorité du catalogue manuel : un ID existant n'est pas écrasé
const collision = compileFromConcepts([{
  id: 'test.concept-collision',
  cognitiveKeys: [declaredKey('cognitive.falsification-search', 'falsification-search')]
}]);
assert.equal(collision.valid, true);
assert.equal(collision.compiledCount, 0);
assert.equal(collision.skippedDuplicates, 1);
assert.ok(collision.warnings.some((w) => w.includes('skipped')));

// 4. Une clé déclarée invalide (opération hors enum) invalide la fusion
const badOperation = compileFromConcepts([{
  id: 'test.concept-bad-op',
  cognitiveKeys: [declaredKey('cognitive.bad-op-key', 'not-a-real-operation')]
}]);
assert.equal(badOperation.valid, false);
assert.ok(badOperation.errors.some((e) => e.includes('operation must be one of')));

// 5. Une clé déclarée avec doctrine dans l'instruction est rejetée
const doctrinal = compileFromConcepts([{
  id: 'test.concept-doctrine',
  cognitiveKeys: [{
    ...declaredKey('cognitive.doctrinal-key', 'boundary-probe'),
    instruction: 'Penser comme Kant : séparer les couches de la représentation avec rigueur.'
  }]
}]);
assert.equal(doctrinal.valid, false);
assert.ok(doctrinal.errors.some((e) => e.includes('doctrine terms')));

// 6. Une clé déclarée trop courte est rejetée (minLength 40)
const tooShort = compileFromConcepts([{
  id: 'test.concept-short',
  cognitiveKeys: [{ ...declaredKey('cognitive.short-key', 'boundary-probe'), instruction: 'Trop court.' }]
}]);
assert.equal(tooShort.valid, false);

// 7. compiledKeys : derivedFrom injecté par concept
const keys = compiledKeys([concept]);
assert.equal(keys.length, 1);
assert.deepEqual(keys[0].derivedFrom, ['test.concept-with-key']);

// 8. Plusieurs concepts, plusieurs clés — fusion additive
const multi = compileFromConcepts([
  { id: 'test.concept-a', cognitiveKeys: [declaredKey('cognitive.multi-a', 'frame-analysis')] },
  { id: 'test.concept-b', cognitiveKeys: [
    declaredKey('cognitive.multi-b1', 'reduction'),
    declaredKey('cognitive.multi-b2', 'emergence-detection')
  ] }
]);
assert.equal(multi.valid, true, multi.errors.join('; '));
assert.equal(multi.compiledCount, 3);
assert.equal(multi.keys.length, BASE_COUNT + 3);

console.log(
  `Cognitive key compiler tests passed (base ${BASE_COUNT} keys, ` +
  `${multi.compiledCount} compiled from declarations, priority + validation enforced).`
);
