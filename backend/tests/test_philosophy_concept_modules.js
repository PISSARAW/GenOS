'use strict';

const assert = require('assert');
const semantic = require('../src/services/philosophy/semanticReferenceService');
const context = require('../src/services/philosophy/contextService');
const speech = require('../src/services/philosophy/speechActService');
const pragmatics = require('../src/services/philosophy/pragmaticsService');
const categorization = require('../src/services/philosophy/categorizationService');
const languageGame = require('../src/services/philosophy/languageGameService');
const discourse = require('../src/services/philosophy/discourseService');
const semiotics = require('../src/services/philosophy/semioticsService');
const poetics = require('../src/services/philosophy/poeticsService');
const deconstruction = require('../src/services/philosophy/deconstructionService');
const hermeneutics = require('../src/services/philosophy/hermeneuticsService');

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
assert.equal(categorization.classifyConcept({
  model: 'family_resemblance', category: 'jeu', features: ['règle', 'joueur'],
  instance: { règle: true, joueur: true }, threshold: 0.75
}).membership, 1);
assert.equal(categorization.classifyConcept({
  model: 'exemplar', instance: { taille: 1 }, topK: 2,
  exemplars: [{ category: 'petit', features: { taille: 1 } }, { category: 'petit', features: { taille: 0.8 } }]
}).membership, 0.9);
const game = languageGame.createLanguageGame({
  name: 'commande', community: 'operators', formOfLife: 'runtime',
  rules: [{ id: 'r1', kind: 'regulative', description: 'publier', requiredRole: 'operator', allowedActions: ['publish'] }]
});
assert.equal(languageGame.evaluateMove({ game, move: { ruleId: 'r1', action: 'publish' }, participantRole: 'operator' }).accepted, true);
assert.equal(languageGame.evaluateMove({ game, move: { ruleId: 'r1', action: 'delete' }, participantRole: 'operator' }).accepted, false);
assert.equal(languageGame.assessRuleFollowing({ rule: { id: 'r1', allowedActions: ['publish'] }, individualActions: ['publish'], communityActions: ['publish'] }).dispositionMatchesNorm, true);
assert.equal(languageGame.analyzePrivateLanguage({ privateCriterion: true }).privateLanguageConcern, true);
assert.equal(discourse.analyzeReportedSpeech({ mode: 'indirect', reportedText: 'Il viendrait.' }).enunciation.transformation, 'recontextualization');
assert.equal(semiotics.analyzeSign({ signifier: 'arbre', signified: 'concept-arbre' }).arbitrary, true);
assert.equal(semiotics.analyzeBinaryOpposition({ left: 'nature', right: 'culture' }).status, 'interpretive');
assert.equal(poetics.analyzeMessage({ message: 'Je marche, je marche.' }).repetitions[0], 'je');
assert.equal(deconstruction.analyzeText({
  text: 'Nature et culture',
  oppositions: [{ left: 'nature', right: 'culture', privileged: 'nature' }],
  traces: ['culture'], supplements: ['écriture']
}).status, 'interpretive');
assert.equal(deconstruction.analyzeLogocentrism({ speechPriority: 1, writingPriority: 0 }).phonocentric, true);
assert.equal(deconstruction.analyzeAutoimmunity({ rule: 'protéger', exception: 'exclure', threat: 'retour' }).internalThreat, true);
const interpretation = hermeneutics.interpret({
  text: 'Le récit', horizon: { language: 'français', concerns: ['identité'] },
  otherHorizon: { language: 'français', concerns: ['identité'] }, confidence: 0.6
});
assert.equal(interpretation.status, 'provisional');
assert.equal(interpretation.fusionOfHorizons.possible, true);
assert.equal(hermeneutics.analyzeSuspicion({ text: 'Le texte', author: 'freud' }).status, 'hypothesis');
assert.equal(hermeneutics.analyzeNarrative({ events: ['départ', 'retour'] }).kind, 'NarrativeConfiguration');

console.log('Philosophy concept module tests passed.');
