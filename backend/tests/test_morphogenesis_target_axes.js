'use strict';

const assert = require('node:assert/strict');
const { migrateState, verifyTransition } = require('../src/services/morphogenesis/transitionEngineService');

const state = {
  topologyState: { topology: 'mesh', organization: 'team-alpha' },
  currentMorphologyVersion: 3,
  budgets: { total: 100, allocated: 20, remaining: 80 }
};
const plan = { id: 'axes-1', actions: [], targetTopology: 'specialist_expert_committee', targetOrganization: 'team-beta' };
migrateState({ fromState: state, toState: state, plan });
assert.equal(state.topologyState.topology, 'specialist_expert_committee');
assert.equal(state.topologyState.organization, 'team-beta');
assert.equal(verifyTransition({ plan, preState: {}, postState: { ...state, agents: new Map() } }).verified, true);
assert.equal(verifyTransition({ plan, preState: {}, postState: { ...state, topologyState: { ...state.topologyState, organization: 'team-alpha' }, agents: new Map() } }).verified, false);
console.log('Morphogenesis target topology and organization axes: PASS');