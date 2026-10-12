'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biome = require('../src/services/biomeCoordinationService');
const openEnded = require('../src/services/biome/variants/openEndedController');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await verifyCycles(db);
  } finally { await db.close(); }
}

async function verifyCycles(db) {
  const runtime = await biome.BiomeRuntime.create('Open-ended candidate proof', {
    db, variant: 'open_ended', maxTicks: 4 });
  const candidate = { id: 'new', descriptor: 'new challenge', novelty: 0.8,
    utility: 0.7, cost: 0.1, evidenceRefs: ['candidate:measured'] };
  const input = { allowGeneration: true, generatedEnvironments: [candidate],
    evidenceRefs: ['cycle:global'], totalBudget: 10 };
  const first = await runtime.step(input);
  assert.deepEqual(first.decision.promoted, ['niche-new']);
  const missingProof = await runtime.step({ ...input,
    generatedEnvironments: [{ ...candidate, evidenceRefs: [] }] });
  assert.deepEqual(missingProof.decision.promoted, []);
  assert.equal(missingProof.decision.candidates, 0);
  const repeated = await runtime.step(input);
  assert.deepEqual(repeated.decision.promoted, []);
  assert.equal(repeated.decision.rejected, 1);
  const restored = await biome.BiomeRuntime.restore(runtime.sessionId, 'open_ended', db);
  const afterRestore = await restored.step(input);
  assert.deepEqual(afterRestore.decision.promoted, []);
  const snapshot = await biome.sessionSnapshot(runtime.sessionId, { db });
  assert.equal(snapshot.niches.filter((niche) => niche.nicheId === 'niche-new').length, 1);
  assert.deepEqual(snapshot.ecologicalState.runtime.history.map((entry) => entry.decision.promoted.length),
    [1, 0, 0, 0]);
  const reevaluated = openEnded.advance({ tick: 1, niches: [] }, {
    environmentArchive: [{ ...candidate, id: 'old-evaluation' }]
  }, { allowGeneration: true, environmentOutcomes: [{ id: 'old-evaluation', utility: 0.9 }] });
  assert.equal(reevaluated.decision.candidates, 0,
    'a new outcome cannot inherit proof from a prior evaluation');
  assert.equal(reevaluated.state.environmentArchive[0].utility, candidate.utility,
    'an unproved outcome cannot rewrite the environment lineage archive');
  const proved = openEnded.advance({ tick: 1, niches: [] }, {
    environmentArchive: [{ ...candidate, id: 'old-evaluation' }]
  }, { allowGeneration: true, environmentOutcomes: [{ id: 'old-evaluation', utility: 0.9,
    evidenceRefs: ['candidate:new-measurement'] }] });
  assert.equal(proved.state.environmentArchive[0].utility, 0.9,
    'a newly evidenced evaluation can update the environment lineage archive');
  console.log('Biome Open-Ended requires candidate-bound evidence and counts new niches once: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
