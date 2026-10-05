'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateMetapopulationVariantRuntime } = require('../src/db/migrations/migrateMetapopulationVariantRuntime');
const cultures = require('../src/services/metapopulation/migration/culturalPersistentRuntimeService');
const actions = require('../src/services/metapopulation/policy/variantFlowActions');
const executor = require('../src/services/metapopulation/runtime/variantActionExecutors');
const verifier = require('../src/services/metapopulation/runtime/variantActionVerifiers');

async function seedDemes(db) {
  const time = new Date().toISOString();
  await db.run(`INSERT INTO metapopulation_sessions
    (id, mission_id, mission, scope, status, created_at, updated_at)
    VALUES (?, ?, ?, 'mission', 'ACTIVE', ?, ?)`, 'culture-session', 'culture-mission', 'Transfer culture', time, time);
  for (const demeId of ['deme-a', 'deme-b']) {
    await db.run(`INSERT INTO metapopulation_patches
      (patch_id, metapopulation_id, carrying_capacity, quality, accessibility, status, created_at, updated_at)
      VALUES (?, ?, 2, 0.8, 0.8, 'OCCUPIED', ?, ?)`, `patch-${demeId}`, 'culture-session', time, time);
    await db.run(`INSERT INTO metapopulation_demes
      (deme_id, metapopulation_id, patch_id, status, updated_at)
      VALUES (?, ?, ?, 'ACTIVE', ?)`, demeId, 'culture-session', `patch-${demeId}`, time);
  }
}

async function testPersistentLineage(db) {
  const context = { db, metapopulationId: 'culture-session' };
  const culture = { id: 'recipe-1', version: 1, parentRefs: [], payloadType: 'PROCEDURE', payloadRef: 'artifact-1' };
  const root = await cultures.registerCulture({ ...context, culture, author: 'deme-a' });
  assert.equal(root.version, 1);
  const time = new Date().toISOString();
  await db.run(`INSERT INTO metapopulation_sessions
    (id, mission_id, mission, scope, status, created_at, updated_at)
    VALUES (?, ?, ?, 'mission', 'ACTIVE', ?, ?)`, 'other-session', 'other-mission', 'Independent culture', time, time);
  const independent = await cultures.registerCulture({ db, metapopulationId: 'other-session',
    culture: { ...culture, payloadRef: 'independent-artifact' }, author: 'other-deme' });
  assert.equal(independent.cultureId, root.cultureId);
  assert.notEqual(independent.contentHash, root.contentHash);
  assert.equal((await cultures.registerCulture({ ...context, culture, author: 'deme-a' })).contentHash, root.contentHash);
  await assert.rejects(() => cultures.registerCulture({ ...context,
    culture: { ...culture, payloadRef: 'changed' } }), { code: 'METAPOPULATION_CULTURE_CONFLICT' });

  const child = await cultures.mutateCulture({ ...context, cultureId: culture.id,
    mutation: { payloadRef: 'artifact-2' }, mutatorId: 'deme-a' });
  assert.equal(child.newVersion, 2);
  assert.equal((await cultures.getCulture({ ...context, cultureId: child.cultureId })).parentCultureId, culture.id);
  const phylogeny = await cultures.buildCulturalPhylogeny(context);
  assert.equal(phylogeny.count, 2);
  assert.deepEqual(phylogeny.roots, [culture.id]);

  const transfer = await cultures.transmitCulture({ ...context, cultureId: culture.id,
    sourceDemeId: 'deme-a', targetDemeId: 'deme-b', compatible: true });
  assert.equal(transfer.transmitted, true);
  assert.equal((await cultures.getCulture({ ...context, cultureId: culture.id })).transmissionCount, 1);
  await db.run("UPDATE metapopulation_demes SET status = 'COLLAPSED' WHERE deme_id = 'deme-b'");
  assert.equal((await cultures.transmitCulture({ ...context, cultureId: culture.id,
    sourceDemeId: 'deme-a', targetDemeId: 'deme-b', compatible: true })).reason, 'DEME_NOT_RESIDENT');
}

async function testCulturalPlanner() {
  const culture = { id: 'recipe-2', version: 1, parentRefs: [], payloadType: 'ARTIFACT' };
  const observed = { variantPolicy: { artifactsOnly: true, transferCulture: true },
    demes: [{ demeId: 'deme-b', lineage: { founders: [] } }] };
  const input = { culturalTransfers: [{ culture, sourceDemeId: 'deme-a', targetDemeId: 'deme-b' }] };
  const planned = await actions.culturalActions(observed, input, {});
  assert.equal(planned[0].type, 'TRANSFER_CULTURE');
  assert.equal(planned[0].sourceDemeId, 'deme-a');
  assert.equal((await actions.heterogeneousCultureActions(observed, input))[0].type, 'TRANSFER_CULTURE');
  await assert.rejects(() => actions.culturalActions(observed, {
    culturalTransfers: [{ culture, targetDemeId: 'deme-b' }]
  }, {}), { code: 'METAPOPULATION_CULTURE_TRANSFER_INVALID' });
}

async function testCulturalExecution(db) {
  const metapopulationId = 'culture-session';
  await db.run("UPDATE metapopulation_demes SET status = 'ACTIVE' WHERE deme_id = 'deme-b'");
  await db.run(`INSERT INTO metapopulation_corridors
    (corridor_id, metapopulation_id, source_deme_id, target_deme_id,
     enabled, capacity, compatibility, updated_at)
    VALUES ('culture-corridor', ?, 'deme-a', 'deme-b', 1, 2, 0.9, ?)`, metapopulationId, new Date().toISOString());
  const culture = { id: 'recipe-3', version: 1, parentRefs: [], payloadType: 'ARTIFACT' };
  const plan = { actions: [
    { type: 'TRANSFER_CULTURE', culture, sourceDemeId: 'deme-a', targetDemeId: 'deme-b' },
    { type: 'MUTATE_CULTURE', cultureId: culture.id, mutation: { payloadRef: 'artifact-3' } },
    { type: 'BUILD_CULTURAL_PHYLOGENY' }
  ] };
  const input = { metapopulationId };
  const options = { db };
  const observed = { demes: [{ demeId: 'deme-a', status: 'ACTIVE' }, { demeId: 'deme-b', status: 'ACTIVE' }],
    corridors: [{ corridorId: 'culture-corridor', sourceDemeId: 'deme-a', targetDemeId: 'deme-b', enabled: true, capacity: 2 }] };
  const results = [];
  for (const action of plan.actions) {
    results.push(await executor.executeVariantAction(action, { input, options, observed }));
  }
  assert.equal(results[0].offered, true);
  assert.equal(results[1].mutated, true);
  assert.ok(results[2].count >= 4);
  assert.equal(await verifier.verifyVariantActions({ plan, input, options, execution: { results } }), true);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateMetapopulationVariantRuntime(db);
  await seedDemes(db);
  await testPersistentLineage(db);
  await testCulturalPlanner();
  await testCulturalExecution(db);
  await db.close();
  console.log('Metapopulation cultural persistence and transfer planning: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
