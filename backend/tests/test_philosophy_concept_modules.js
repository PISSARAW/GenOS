'use strict';

const assert = require('assert');
const semantic = require('../src/services/philosophy/semanticReferenceService');
const context = require('../src/services/philosophy/contextService');
const speech = require('../src/services/philosophy/speechActService');
const pragmatics = require('../src/services/philosophy/pragmaticsService');
const categorization = require('../src/services/philosophy/categorizationService');

assert.equal(semantic.analyzeExpression({ expression: 'étoile du matin' }).status, 'structured');
assert.equal(semantic.resolveReference({ expression: 'Vénus', context: { Vénus: 'planet-2' } }).reference, 'planet-2');
assert.equal(semantic.evaluateDefiniteDescription({ description: 'le roi', domain: [{ id: 'x', satisfies: true }] }).russell.true, true);
assert.equal(context.resolveIndexical({ expression: 'ici', context: { location: 'Paris' } }).content, 'Paris');
assert.equal(speech.analyzeSpeechAct({ utterance: 'Pouvez-vous venir ?' }).illocution.force, 'question');
assert.deepEqual(pragmatics.analyzeImplicature({ utterance: 'Il est tard', floutedMaxims: ['quantity'] }).floutedMaxims, ['quantity']);
assert.equal(categorization.classifyConcept({
  model: 'prototype', instance: { size: 1, wings: 1 },
  prototypes: [{ category: 'oiseau', features: { size: 1, wings: 1 } }]
}).category, 'oiseau');

console.log('Philosophy concept module tests passed.');
