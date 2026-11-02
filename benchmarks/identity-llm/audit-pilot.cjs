'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const corpus = require('./corpus.cjs');
const evidence = require('./evidence.cjs');
const runtime = require('./runtime.cjs');
const { replayEvents } = require('./verify.cjs');

async function main(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'development-manifest.json'), 'utf8'));
  assert.equal(manifest.developmentOnly, true);
  assert.equal(manifest.fullCampaignQualified, false);
  for (const [key, value] of Object.entries(require('./baseline-criteria.json'))) assert.deepEqual(manifest.protocol[key], value);
  for (const [file, hash] of Object.entries(manifest.provenance.sources)) assert.equal(await evidence.fileHash(file), hash);
  const w = corpus.world(manifest.seed);
  assert.deepEqual(w, JSON.parse(fs.readFileSync(path.join(directory, 'private-world.json'), 'utf8')));
  const events = evidence.journal(directory);
  const db = await runtime.open(path.join(directory, 'runtime.sqlite'));
  try {
    const state = await replayEvents(db, { events, w });
    const cycles = manifest.developmentCycles || 24;
    assert(Number.isInteger(cycles) && cycles >= 1 && cycles <= 50);
    assert.equal(state.cycle, cycles);
    assert.equal(state.assignments.size, 120);
    const expectedCalls = 2 * cycles + Math.floor(cycles / manifest.protocol.descendantProbeEvery) + 120;
    assert.equal(events.filter(row => row.type === 'response-committed').length, expectedCalls);
    assert.deepEqual((await runtime.state(db, w.actors[0])).lessons, state.lessons);
    for (const actor of w.actors) assert.equal((await runtime.ledger.verify(db, actor)).valid, true);
    console.log('VERIFIED DEVELOPMENT ONLY: raw replies receipts retained rules causal context and oracle; not a full qualification');
  } finally { await db.close(); }
}

if (require.main === module) main(path.resolve(process.argv[2])).catch(error => { console.error(error); process.exitCode = 1; });
