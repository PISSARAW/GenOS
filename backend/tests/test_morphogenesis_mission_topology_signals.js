'use strict';

const assert = require('node:assert/strict');
const { inferMissionTopologySignals } = require('../src/services/morphogenesis/missionTopologySignals');
const { resolveTopology } = require('../src/services/morphogenesis/topologyResolverService');

const capacityMission = 'Distribute seven items into three groups without exceeding the capacity limit.';
const capacitySignals = inferMissionTopologySignals(capacityMission);
assert.equal(capacitySignals.resource_allocation_focus, 1);
assert.equal(capacitySignals.a_team_eligible, false);
const capacitySelection = resolveTopology({ problemProfile: { uncertainty: 0.1, ...capacitySignals } });
assert.equal(capacitySelection.topology, 'biome');
assert.equal(capacitySelection.rankings[0].topology, 'biome');
assert.equal(capacitySelection.rankings.find(item => item.topology === 'a_team').selectionEligible, false);

const engineeringMission = 'Implement a Node API backed by SQLite and add regression tests.';
assert.equal(inferMissionTopologySignals(engineeringMission).a_team_eligible, true);
console.log('Mission topology signals: PASS');