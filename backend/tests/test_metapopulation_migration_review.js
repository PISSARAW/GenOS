'use strict';

const assert = require('node:assert/strict');
const migration = require('../src/services/metapopulation/metapopulationMigrationService');
const { reviewPrompt } = require('../src/services/metapopulation/metapopulationMissionResultService');

const peerResults = [
  { role: 'receiver', answer: 'my private schedule', transferableIdeas: [] },
  { role: 'sender', answer: 'peer full solution must stay private', transferableIdeas: [
    { ideaId: 'sender-idea-1', technique: 'sort tasks by descending duration',
      rationale: 'large tasks placed early reduce imbalance', evidenceRefs: ['evidence-7'] },
    { ideaId: 'bad', technique: 'copy this', rationale: 'unsafe', evidenceRefs: ['e1'], solution: 'whole answer' }
  ] }
];
const prompt = reviewPrompt({ role: 'receiver', mission: 'Solve locally.' }, peerResults);
assert.ok(prompt.includes('sort tasks by descending duration'));
assert.ok(!prompt.includes('peer full solution must stay private'));
assert.ok(!prompt.includes('whole answer'));
const context = migration.reviewContext(prompt);
assert.equal(context.baselineAnswer, 'my private schedule');
assert.equal(context.candidates.length, 1);

const baseline = { applicable: true, valid: true, computedMakespan: 12, fitnessDirection: 'minimize' };
const improved = { applicable: true, valid: true, computedMakespan: 10, fitnessDirection: 'minimize' };
const accepted = migration.validateReviewDecisions({
  candidates: context.candidates, baselineValidation: baseline, finalValidation: improved,
  decisions: [{ ideaId: 'sender-idea-1', decision: 'accepted', reason: 'verified improvement',
    localValidation: true, evidenceRefs: ['local-test'], fitnessBefore: 12, fitnessAfter: 10, fitnessDirection: 'minimize' }]
});
assert.equal(accepted[0].decision, 'accepted');
const rejected = migration.validateReviewDecisions({
  candidates: context.candidates, baselineValidation: baseline,
  finalValidation: { ...improved, valid: false },
  decisions: [{ ideaId: 'sender-idea-1', decision: 'accepted', reason: 'unverified',
    localValidation: true, evidenceRefs: ['claim'], fitnessBefore: 12, fitnessAfter: 10, fitnessDirection: 'minimize' }]
});
assert.equal(rejected[0].decision, 'rejected');

console.log('Metapopulation migration review: PASS');
