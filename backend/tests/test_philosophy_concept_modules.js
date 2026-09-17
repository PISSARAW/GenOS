'use strict';

const assert = require('assert');
const semantic = require('../src/services/philosophy/semanticReferenceService');
const context = require('../src/services/philosophy/contextService');
const speech = require('../src/services/philosophy/speechActService');
const pragmatics = require('../src/services/philosophy/pragmaticsService');
const categorization = require('../src/services/philosophy/categorizationService');
const languageGame = require('../src/services/philosophy/languageGameService');

assert.equal(semantic.analyzeExpression({ expression: 'étoile du matin' }).status, 'structured');
assert.equal(semantic.resolveReference({ expression: 'Vénus', context: { Vénus: 'planet-2' } }).reference, 'planet-2');
assert.equal(semantic.evaluateDefiniteDescription({ description: 'le roi', domain: [{ id: 'x', satisfies: true }] }).russell.true, true);
assert.equal(context.resolveIndexical({ expression: 'ici', context: { location: 'Paris' } }).content, 'Paris');
const indirect = speech.analyzeSpeechAct({ utterance: 'Pouvez-vous venir ?', speaker: 'a', addressee: 'b' });
assert.equal(indirect.illocution.force, 'directive');
assert.equal(indirect.indirectAct.detected, true);
assert.equal(speech.analyzeSpeechAct({ utterance: 'Je promets de venir.' }).actType, 'performative');
assert.deepEqual(pragmatics.analyzeImplicature({ utterance: 'Il est tard', floutedMaxims: ['quantity'] }).floutedMaxims, ['quantity']);
assert.equal(pragmatics.assessMaxims({ utterance: 'Il est tard', violatedMaxims: ['quantity'] }).violated[0], 'quantity');
assert.equal(categorization.classifyConcept({
  model: 'prototype', instance: { size: 1, wings: 1 },
  prototypes: [{ category: 'oiseau', features: { size: 1, wings: 1 } }]
}).category, 'oiseau');
const game = languageGame.createLanguageGame({
  name: 'commande', community: 'operators', formOfLife: 'runtime',
  rules: [{ id: 'r1', kind: 'regulative', description: 'publier', requiredRole: 'operator', allowedActions: ['publish'] }]
});
assert.equal(languageGame.evaluateMove({ game, move: { ruleId: 'r1', action: 'publish' }, participantRole: 'operator' }).accepted, true);
assert.equal(languageGame.evaluateMove({ game, move: { ruleId: 'r1', action: 'delete' }, participantRole: 'operator' }).accepted, false);
assert.equal(languageGame.assessRuleFollowing({ rule: { id: 'r1', allowedActions: ['publish'] }, individualActions: ['publish'], communityActions: ['publish'] }).dispositionMatchesNorm, true);
assert.equal(languageGame.analyzePrivateLanguage({ privateCriterion: true }).privateLanguageConcern, true);

console.log('Philosophy concept module tests passed.');
