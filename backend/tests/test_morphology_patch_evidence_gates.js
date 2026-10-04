'use strict';

const assert = require('node:assert/strict');
const { PatchExecutor } = require('../src/services/morphogenesis/transitions/patchExecutor');
const { createMorphologyPatch, createOperation } = require('../src/services/morphogenesis/transitions/morphologyPatch');
const { VariantResolver } = require('../src/services/morphogenesis/variants/variantResolver');

const graph = { version: 1, rootNodeId: 'root', nodes: [{ nodeId: 'root', topology: 'trinity', variant: 'controlled' }], edges: [] };
const rollbackPlan = { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] };
const patch = createMorphologyPatch({ baseGraphVersion: 1,
  operations: [createOperation('CHANGE_VARIANT', { nodeId: 'root', newVariant: 'adaptive' })],
  reason: 'test guarded transition', evidence: [{ type: 'trial', receipt: 'verified' }], rollbackPlan });
const trialGraphs = [];
const runtime = { execute: async (input) => { trialGraphs.push(input); return { quality: 0.8 }; } };
const adjudicator = { adjudicate: async () => ({ approved: true }) };
const verifier = { verify: async () => ({ valid: true, errors: [] }) };

async function main() {
  const missing = await new PatchExecutor({ runtime }).execute(patch, graph);
  assert.equal(missing.success, false);
  assert.match(missing.error, /adjudicator is required/);
  const missingVerifier = await new PatchExecutor({ runtime, adjudicator }).execute(patch, graph);
  assert.equal(missingVerifier.success, false);
  assert.match(missingVerifier.error, /verifier is required/);
  const rejected = await new PatchExecutor({ runtime, adjudicator: { adjudicate: async () => ({ approved: 1 }) }, verifier }).execute(patch, graph);
  assert.equal(rejected.success, false);
  assert.equal(rejected.execution.commitResult, null);
  const unverified = await new PatchExecutor({ runtime, adjudicator, verifier: { verify: async () => ({ valid: 1 }) } }).execute(patch, graph);
  assert.equal(unverified.success, false);
  assert.equal(unverified.execution.commitResult, null);
  const committed = await new PatchExecutor({ runtime, adjudicator, verifier }).execute(patch, graph);
  assert.equal(committed.success, true);
  assert.equal(committed.execution.commitResult.graph.nodes[0].variant, 'adaptive');
  assert.equal(committed.execution.commitResult.graph.version, 2);
  assert.equal(trialGraphs.at(-1).nodes[0].variant, 'adaptive');
  assert.equal(graph.nodes[0].variant, 'controlled');

  const registry = { getTransition: () => ({ requiresEvidence: ['trial'] }),
    canTransition: (...args) =>
      ({ allowed: args[4].evidence?.some((item) => item.type === 'trial') === true, reason: 'Required evidence not present' }) };
  const resolver = new VariantResolver({ registry, patchExecutor: new PatchExecutor({ runtime, adjudicator, verifier }) });
  const denied = await resolver.changeVariant('root', graph, { rollbackPlan }, 'adaptive');
  assert.equal(denied.success, false);
  assert.equal(denied.changed, false);
  const changed = await resolver.changeVariant('root', graph, { rollbackPlan, evidence: [{ type: 'trial', receipt: 'verified' }] }, 'adaptive');
  assert.equal(changed.success, true);
  assert.equal(changed.changed, true);
  assert.equal(changed.graph.nodes[0].variant, 'adaptive');
  assert.equal(graph.nodes[0].variant, 'controlled');
  console.log('Morphology patch evidence gates passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
