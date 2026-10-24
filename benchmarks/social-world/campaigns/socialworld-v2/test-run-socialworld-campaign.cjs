'use strict';

const assert = require('node:assert/strict');
const manifest = require('./manifest.json');
const { commonHashes, expandRuns } = require('./run-socialworld-campaign.cjs');

const runs = expandRuns({ all: true }, manifest);
assert.equal(runs.length, 480);
assert.equal(new Set(runs.map((run) => run.scenario)).size, 6);
assert.equal(runs.filter((run) => run.seed === manifest.seeds[0]).length, 24);
assert.throws(() => expandRuns({ scenario: 'V2-99', seed: manifest.seeds[0], arm: 'genos-full' }, manifest), /Unknown scenario/);
assert.throws(() => expandRuns({ scenario: 'V2-01', seed: 'unregistered', arm: 'genos-full' }, manifest), /Unknown seed/);
const hashes = commonHashes({ events: { id: 'event-1', order: [1, 2] },
  budget: { tokens: 100 }, permissions: { audience: ['a', 'b'] } });
assert.equal(hashes.eventsHash.length, 64);
assert.deepEqual(hashes, commonHashes({ permissions: { audience: ['a', 'b'] }, budget: { tokens: 100 },
  events: { order: [1, 2], id: 'event-1' } }));
assert.equal(commonHashes({}), null, 'missing experiment inputs must not receive synthetic comparison hashes');
process.stdout.write('SocialWorld campaign dispatcher expands all 480 declared scenario-arm-seed runs\n');
