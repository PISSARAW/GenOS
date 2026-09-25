'use strict';

const assert = require('node:assert/strict');
const { evaluateFixtureSubmission } = require('../src/services/comparativeMissionEvaluationService');

const greedy = evaluateFixtureSubmission({ fixtureId: 'level-1', method: 'gloutonne', answer:
  'Machine 1 -> E (6), B (3), A (2). Machine 2 -> D (5), C (4). Makespan = 11.' });
assert.equal(greedy.valid, true);
const dynamic = evaluateFixtureSubmission({ fixtureId: 'level-1', method: 'programmation dynamique', answer:
  'Machine 1 -> E (6), C (4). Machine 2 -> D (5), B (3), A (2). Makespan = 10.' });
assert.equal(dynamic.valid, true);

const design = evaluateFixtureSubmission({ fixtureId: 'level-2', method: 'navigateur desktop', submission: {
  environment: { checks: Object.fromEntries(['list', 'add', 'complete', 'offline', 'persistence', 'local-fitness'].map((key) => [key, true])), evidenceRefs: ['design-spec-v1'] }
} });
assert.equal(design.valid, true);

const packing = evaluateFixtureSubmission({ fixtureId: 'level-4', submission: { bins: [
  { id: 'x', items: [{ id: 'A', weight: 7 }, { id: 'E', weight: 3 }] },
  { id: 'y', items: [{ id: 'B', weight: 6 }, { id: 'D', weight: 4 }] },
  { id: 'z', items: [{ id: 'C', weight: 5 }, { id: 'F', weight: 2 }, { id: 'G', weight: 2 }] }
] } });
assert.equal(packing.valid, true);

const security = evaluateFixtureSubmission({ fixtureId: 'level-5', submission: { findings: [
  { id: 'timing-comparison', evidenceRef: 'compare les signatures avec ==' },
  { id: 'cookie-flags', evidenceRef: 'ni Secure ni SameSite' },
  { id: 'missing-authorization', evidenceRef: 'sans contrôler le sujet ni le rôle' },
  { id: 'path-traversal', evidenceRef: 'sans canonicalisation' }
] } });
assert.equal(security.valid, true);
assert.equal(evaluateFixtureSubmission({ fixtureId: 'level-5', submission: { findings: [
  { id: 'invented', evidenceRef: 'une vulnérabilité inventée' }
] } }).valid, false);

const recolonization = evaluateFixtureSubmission({ fixtureId: 'level-6', submission: {
  collapse: { populationId: 'greedy', initialSelection: ['A'] },
  recolonization: { founderLineages: ['alpha', 'beta'], projects: ['C'], neighborProjects: ['E'] },
  continuingPopulations: [
    { populationId: 'dynamic', projects: ['C'] },
    { populationId: 'local', projects: ['D'] },
    { populationId: 'evolutionary', projects: ['E'] }
  ]
} });
assert.equal(recolonization.valid, true);
const clonedRecovery = evaluateFixtureSubmission({ fixtureId: 'level-6', submission: {
  collapse: { populationId: 'greedy', initialSelection: ['A'] },
  recolonization: { founderLineages: ['alpha', 'alpha'], projects: ['C'], neighborProjects: ['E'] },
  continuingPopulations: [
    { populationId: 'dynamic', projects: ['C'] },
    { populationId: 'local', projects: ['D'] },
    { populationId: 'evolutionary', projects: ['E'] }
  ]
} });
assert.equal(clonedRecovery.valid, false);
const nonContinuingRecovery = evaluateFixtureSubmission({ fixtureId: 'level-6', submission: {
  collapse: { populationId: 'greedy', initialSelection: ['A'] },
  recolonization: { founderLineages: ['alpha', 'beta'], projects: ['C'], neighborProjects: ['E'] },
  continuingPopulations: [{ populationId: 'dynamic', projects: ['C'] }]
} });
assert.equal(nonContinuingRecovery.valid, false);
assert.equal(evaluateFixtureSubmission({ fixtureId: 'level-3', submission: {
  sandboxReceipt: { runnerId: 'claimed', evidenceRef: 'claimed', casesPassed: 5 }
} }).valid, false);

console.log('Comparative mission evaluations: PASS');
