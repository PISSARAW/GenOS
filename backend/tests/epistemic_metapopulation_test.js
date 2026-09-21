'use strict';

const assert = require('node:assert');
const M = require('../src/services/epistemic/epistemicMetapopulationService');

// ---- création population ----

const popA = M.createPopulation({ niche: 'test', strategy: ['isolate', 'reproduce'] });
assert.ok(popA.id);
assert.strictEqual(popA.niche, 'test');
assert.strictEqual(popA.strategy.length, 2);
assert.strictEqual(popA.isolation, true);
assert.strictEqual(popA.results.length, 0);

// ---- addResult ----

const r1 = M.addResult(popA, { claim: 'X > 3', evidence: 'test passed', confidence: 0.85 });
assert.ok(r1.id);
assert.strictEqual(r1.claim, 'X > 3');
assert.strictEqual(r1.confidence, 0.85);
assert.strictEqual(r1.provider, 'unknown');
assert.strictEqual(popA.results.length, 1);

const r2 = M.addResult(popA, { claim: 'X < 5', evidence: 'replay ok', confidence: 0.7 });
assert.strictEqual(popA.results.length, 2);

// ---- migration ----

const popB = M.createPopulation({ niche: 'replay', strategy: ['reproduce', 'compare'] });
const migrated = M.migrateResults(popA, popB, { append: true });
assert.strictEqual(migrated.length, 2);
assert.strictEqual(popB.results.length, 2);
assert.ok(migrated[0].migratedFrom);
assert.ok(migrated[0].migratedTo);
assert.ok(migrated[0].migrationId);

// ---- convergence indépendante ----

const popC = M.createPopulation({ niche: 'C', strategy: ['s1'] });
const popD = M.createPopulation({ niche: 'D', strategy: ['s2'] });
const popE = M.createPopulation({ niche: 'E', strategy: ['s3'] });

M.addResult(popC, { claim: 'convergence claim', confidence: 0.8 });
M.addResult(popD, { claim: 'convergence claim', confidence: 0.7 });
M.addResult(popE, { claim: 'convergence claim', confidence: 0.9 });

const convergence = M.independentConvergence([popC, popD, popE]);
assert.strictEqual(convergence.convergenceCount, 1);
assert.strictEqual(convergence.populations, 3);
assert.strictEqual(convergence.convergenceRate, 1);

// ---- cross contamination ----

const popF = M.createPopulation({ niche: 'F' });
const popG = M.createPopulation({ niche: 'G' });

M.addResult(popF, { claim: 'same claim', confidence: 0.5 });
M.addResult(popG, { claim: 'same claim', confidence: 0.5 });

// La contamination se mesure par provenance (migratedResults), pas par égalité.
// Ici les claims sont natifs (pas migrés), donc pas de contamination.
const contamination = M.crossContamination([popF, popG]);
assert.strictEqual(contamination, 0, 'claims natifs identiques ≠ contamination');

// Après migration, la contamination est mesurée.
M.migrateResults(popF, popG, { append: true });
const afterMigration = M.crossContamination([popF, popG]);
assert.ok(afterMigration > 0, 'migration augmente la contamination');

// ---- migration plan ----

const plan = M.migrationPlan([popA, popB, popC]);
assert.strictEqual(plan.length, 3);
assert.ok(plan.every((p) => p.allowed));

// ---- report ----

const report = M.metapopulationReport([popA, popB, popC, popD, popE]);
assert.strictEqual(report.populations, 5);
assert.ok(report.totalResults > 0);
assert.ok(report.convergence);
assert.ok(report.crossContamination >= 0);
assert.strictEqual(report.migrationPlan.length, 10);

console.log('OK epistemicMetapopulationService');
