'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { installTopologyPlugins } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const metapopulation = require('../src/services/metapopulationCoordinationService');
const search = require('../src/services/metapopulation/policy/variantSearchActions');
const flow = require('../src/services/metapopulation/policy/variantFlowActions');
const lifecycle = require('../src/services/metapopulation/policy/variantLifecycleActions');
const trigger = require('../src/services/metapopulation/migration/adaptiveMigrationTriggerService');

async function variantBoundaries() {
  const islandInterval = trigger.calculateAdaptiveInterval({ variant: 'island_search', baseInterval: 5 });
  const island = await search.islandSearchActions({ variantPolicy: { migrationFrequency: 'periodic' },
    demes: [] }, { cycle: islandInterval }, {});
  assert.equal(island.some((action) => action.type === 'TRIGGER_ISLAND_MIGRATION'), true);
  const stoneInterval = trigger.calculateAdaptiveInterval({ variant: 'stepping_stone', baseInterval: 10 });
  const stone = await flow.steppingStoneActions({ variantPolicy: { migrationFrequency: 'rare',
    corridorTopology: 'stepping-stone' }, demes: [], corridors: [] }, { cycle: stoneInterval }, {});
  assert.equal(stone.some((action) => action.type === 'TRIGGER_STEPPING_STONE_MIGRATION'), true);
  const region = { variantPolicy: { founderReserveSize: 2 },
    demes: [{ status: 'AT_RISK' }], corridors: [], regionalMemory: {} };
  const missing = await lifecycle.rescueNetworkActions(region, {}, {});
  assert.equal(missing.some((action) => action.type === 'STAGE_FOUNDER_RESERVE'), false);
  const available = await lifecycle.rescueNetworkActions(region,
    { founderCandidates: [{ lineageId: 'a' }, { lineageId: 'b' }] }, {});
  assert.equal(available.some((action) => action.type === 'STAGE_FOUNDER_RESERVE'), true);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const plugins = new Map();
  installTopologyPlugins({ registerTopology: (name, plugin) => plugins.set(name, plugin) });
  try {
    await variantBoundaries();
    const result = await plugins.get('metapopulation').run({ variant: 'rescue_network',
      mission: 'Recover an isolated region.', workers: [] }, { input: { db } });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.executionMode, 'service_runtime');
    assert.equal(result.reason, 'REGION_UNPOPULATED');
    assert.equal(result.missionVerified, false);
    const row = await db.get('SELECT variant, variant_policy_json FROM metapopulation_sessions WHERE id = ?', result.sessionId);
    assert.equal(row.variant, 'rescue_network');
    assert.equal(JSON.parse(row.variant_policy_json).rescuePriority, 'at-risk');
    const alias = await plugins.get('metapopulation').run({ variant: 'rescue-network',
      mission: 'Recover an isolated region.' }, { input: { db, metapopulationId: result.sessionId } });
    assert.equal(alias.status, 'BLOCKED');
    await assert.rejects(() => plugins.get('metapopulation').run({ variant: 'balanced',
      mission: 'Recover an isolated region.' }, { input: { db, metapopulationId: result.sessionId } }),
    (error) => error.code === 'METAPOPULATION_VARIANT_MISMATCH');
    await metapopulation.createPatch(result.sessionId, { patchId: 'patch-1', environment: {},
      requirements: [], resources: {}, carryingCapacity: 2, quality: 1, accessibility: 1 }, { db });
    await metapopulation.createDeme(result.sessionId, { demeId: 'deme-1', patchId: 'patch-1' }, { db });
    const populated = await plugins.get('metapopulation').run({ variant: 'rescue_network',
      mission: 'Recover an isolated region.' }, { input: { db, metapopulationId: result.sessionId } });
    assert.equal(populated.missionVerified, false);
    assert.notEqual(populated.reason, 'REGION_UNPOPULATED');
    console.log('Metapopulation morphogenesis variant and empty-region boundary: PASS');
  } finally { await db.close(); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
