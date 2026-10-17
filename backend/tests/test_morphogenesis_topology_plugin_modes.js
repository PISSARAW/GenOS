'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { installTopologyPlugins, PLUGIN_TOPOLOGIES } = require('../src/services/morphogenesis/runtime/topologyPlugins');

async function run() {
  const plugins = new Map();
  installTopologyPlugins({ registerTopology: (name, plugin) => plugins.set(name, plugin) });
  assert.deepEqual([...plugins.keys()].sort(), [...PLUGIN_TOPOLOGIES].sort(),
    'every canonical topology must have one installed plugin');

  const localInputs = {
    trinity: { hypotheses: [], evidence: [] },
    a_team: { requirements: [], verified_claims: [], work_packages: [] },
    rhizome: { problemSpace: [] },
    syncytium: { document: {}, operations: [] },
    biocenose: {}
  };
  for (const [topology, input] of Object.entries(localInputs)) {
    const output = await plugins.get(topology).run({}, { input: { ...input, mission: `mode-${topology}` } });
    assert.equal(output.executionMode, 'simulated_controller', `${topology} must expose its local mode`);
  }

  const worker = (id, role, chamber = null) => ({ id, role, chamber, artifactType: 'report', evidenceReport: { outcome: 'success', role, chamber,
    workerArtifact: { type: 'report', content: `${id}-artifact`, provenance: { sourceRefs: [`evidence:${id}`] } } } });
  const trinityWorkers = [worker('world-1', 'thesis', 'thesis'), worker('world-2', 'antithesis', 'antithesis'),
    worker('world-3', 'synthesis', 'synthesis')];
  const trinityBacked = await plugins.get('trinity').run({ workers: trinityWorkers }, {
    input: { mission: 'worker-backed-trinity', workerResults: trinityWorkers }
  });
  assert.equal(trinityBacked.executionMode, 'worker_backed_controller');
  assert.equal(trinityBacked.executionProof.workerCount, 3);
  assert.deepEqual(trinityBacked.executionProof.evidenceRefs.sort(),
    ['evidence:world-1', 'evidence:world-2', 'evidence:world-3']);

  const aTeamWorkers = [worker('architect-1', 'architecture'), worker('security-1', 'security'),
    worker('integration-1', 'integration')];
  const aTeamBacked = await plugins.get('a_team').run({ workers: aTeamWorkers }, {
    input: { mission: 'worker-backed-a-team', workerResults: aTeamWorkers }
  });
  assert.equal(aTeamBacked.executionMode, 'worker_backed_controller');
  assert.equal(aTeamBacked.executionProof.workerCount, 3);
  assert.equal(aTeamBacked.architecture.workerId, 'architect-1');
  assert.equal(aTeamBacked.security.workerId, 'security-1');
  assert.equal(aTeamBacked.integration.workerId, 'integration-1');

  const biome = await plugins.get('biome').run({ mission: 'mode-biome' }, {
    input: { mission: 'mode-biome', maxTicks: 1 }
  });
  assert.equal(biome.executionMode, 'service_runtime');

  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const metapopulation = await plugins.get('metapopulation').run({ mission: 'mode-metapopulation' }, { input: { db } });
    assert.equal(metapopulation.executionMode, 'service_runtime');
  } finally {
    await db.close();
  }
  console.log('Morphogenesis topology plugin mode coverage: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
