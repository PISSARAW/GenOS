'use strict';

const { performance } = require('perf_hooks');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');
const coordination = require('../src/services/metapopulationCoordinationService');
const policy = require('../src/services/metapopulation/policy/metapopulationPolicyService');

async function createDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');
  await migrateMetapopulationRuntime(db);
  return db;
}

async function seedSession(db, variant) {
  const session = await coordination.createMetapopulationSession('Comparer le variant ' + variant + '.', { db, variant });
  const sessionId = session.metapopulationId;
  await coordination.createPatch(sessionId, { patchId: 'patch-a', environment: {}, requirements: [], resources: {}, carryingCapacity: 2, quality: 0.8, accessibility: 0.8 }, { db });
  await coordination.createDeme(sessionId, { demeId: 'deme-a', patchId: 'patch-a', fitness: { score: 0.9 }, localStrategies: ['strategy-a'] }, { db });
  await coordination.transitionDeme({ sessionId, demeId: 'deme-a', status: 'ESTABLISHING' }, { db });
  await coordination.transitionDeme({ sessionId, demeId: 'deme-a', status: 'ACTIVE' }, { db });
  return sessionId;
}

async function runOneVariant(variant) {
  const db = await createDatabase();
  try {
    const sessionId = await seedSession(db, variant);
    const start = performance.now();
    const result = await coordination.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
    const durationMs = Number((performance.now() - start).toFixed(3));
    return { variant, status: result.status, cycleStatus: result.cycles?.[0]?.status || null, durationMs };
  } finally {
    await db.close();
  }
}

async function compareVariants(variants) {
  const results = [];
  for (const variant of variants) {
    results.push(await runOneVariant(variant));
  }
  return { comparison: 'metapopulation-variants-equal-budget-v1', variants: results };
}

function selectedVariants() {
  return Object.keys(policy.VARIANTS);
}

async function main() {
  const report = await compareVariants(selectedVariants());
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createDatabase, seedSession, runOneVariant, compareVariants, selectedVariants };
