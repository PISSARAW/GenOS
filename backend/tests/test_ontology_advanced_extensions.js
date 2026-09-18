'use strict';

const assert = require('assert');
const worlds = require('../src/services/ontology/possibleWorldService');

const causal = worlds.evaluateCausalDependence({
  worldId: 'world-1', causeAgent: 'agent-a', effectAgent: 'agent-b',
  actualOutcome: 'completed', counterfactualOutcome: 'blocked',
});
assert.equal(causal.verdict, 'necessary');
assert.equal(causal.evidenceStatus, 'simulated');
assert.throws(() => worlds.evaluateCausalDependence({ worldId: 'world-1', causeAgent: 'a' }), /effectAgent/);

console.log('Advanced ontology extension tests passed.');
