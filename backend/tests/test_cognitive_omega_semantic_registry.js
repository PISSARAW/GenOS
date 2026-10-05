'use strict';

const assert = require('node:assert/strict');
const registry = require('../src/services/cognitiveOmegaSemanticRegistryService');
const domainGraph = require('../src/services/cognitiveOmegaDomainGraphService');

const EXPECTED_DOMAINS = ['biocenose', 'controller', 'evaluation', 'primitive', 'runtime', 'signal', 'trinity', 'worker'];

assert.deepEqual(registry.domains(), EXPECTED_DOMAINS);
assert.equal(registry.resolve('trinity/experiment').domain, 'trinity');
assert.equal(registry.forDomain('worker').tool, 'worker/execute');

const graph = domainGraph.build({ domain: 'trinity', objects: { mission: 'mission-1' } });
assert.equal(registry.validateGraph(graph).valid, true);
assert.equal(registry.validateGraph({ ...graph, operations: [{ ...graph.operations[2], reference: 'unknown/handler' }] }).valid, false);
assert.equal(registry.validateGraph({
  ...graph,
  operations: graph.operations.map((operation) => operation.kind === 'CHECK'
    ? { ...operation, verification: 'wrong' } : operation)
}).reason, 'omega_verification_intent_mismatch');

console.log('cognitive omega semantic registry tests: ok');
