'use strict';
const assert = require('node:assert/strict');
const { applyOperation } = require('../src/services/morphogenesis/transitions/patchOperations');
const { PatchExecutor } = require('../src/services/morphogenesis/transitions/patchExecutor');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { validateMorphologyGraph } = require('../src/services/morphogenesis/graph/morphologyGraphValidator');
const rollbackPlan = { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] };
function fresh() {
  return { graphId: 'patch', version: 1, rootNodeId: 'root', nodes: [
    { nodeId: 'root', kind: 'OPERATOR', operator: 'PARALLEL', children: ['a', 'b'], budget: { tokens: 100 } },
    { nodeId: 'a', kind: 'TOPOLOGY', topology: 'trinity', parentNodeId: 'root', children: [], budget: { tokens: 40 }, workers: [{ id: 'w', role: 'critic', memory: { key: 1 } }], state: { key: 1 } },
    { nodeId: 'b', kind: 'TOPOLOGY', topology: 'trinity', parentNodeId: 'root', children: [], budget: { tokens: 40 }, workers: [], state: {} }
  ], edges: [
    { edgeId: 'contains-a', type: 'CONTAINS', fromNodeId: 'root', toNodeId: 'a' },
    { edgeId: 'contains-b', type: 'CONTAINS', fromNodeId: 'root', toNodeId: 'b' }
  ] };
}
function mutate(graph, op) { applyOperation(graph, op); assert.equal(validateMorphologyGraph(graph).valid, true); }
function structuralMutations() {
  const graph = fresh();
  mutate(graph, { type: 'ADD_NODE', node: { nodeId: 'c', parentNodeId: 'root', children: [] } });
  assert.ok(graph.nodes[0].children.includes('c'));
  mutate(graph, { type: 'MOVE_SUBTREE', nodeId: 'c', newParentId: 'a' });
  assert.ok(!graph.nodes[0].children.includes('c')); assert.ok(graph.nodes[1].children.includes('c'));
  assert.throws(() => applyOperation(graph, { type: 'MOVE_SUBTREE', nodeId: 'a', newParentId: 'c' }), /cycle/);
  mutate(graph, { type: 'REMOVE_NODE', nodeId: 'c' });
  mutate(graph, { type: 'SPLIT', nodeId: 'a', splitResult: [{ nodeId: 'left' }, { nodeId: 'right' }] });
  assert.equal(graph.nodes.find(n => n.nodeId === 'a').operator, 'PARALLEL');
  assert.equal(graph.nodes.find(n => n.nodeId === 'left').parentNodeId, 'a');
  assert.deepEqual(graph.nodes.find(n => n.nodeId === 'left').workers[0].memory, { key: 1 });
  assert.equal(graph.nodes.find(n => n.nodeId === 'a').workers.length, 0);
  const merged = fresh();
  merged.nodes[1].budget.compute = { cpu: 2 }; merged.nodes[2].budget.compute = { cpu: 3 };
  assert.throws(() => applyOperation(merged, { type: 'MERGE', nodeIds: ['a', 'b', 'b'] }), /distinct/);
  assert.throws(() => applyOperation(merged, { type: 'ADD_EDGE', edge: { type: 'CONTAINS', fromNodeId: 'a', toNodeId: 'b' } }), /NEST/);
  mutate(merged, { type: 'MERGE', nodeIds: ['a', 'b'], mergedNode: { nodeId: 'joined' } });
  assert.deepEqual(merged.nodes[0].children, ['joined']);
  assert.equal(merged.nodes[1].budget.compute.cpu, 5);
  assert.equal(merged.nodes[1].budget.tokens, 80); assert.equal(merged.nodes[1].workers[0].role, 'critic');
}
function nonStructuralMutations() {
  const graph = fresh();
  mutate(graph, { type: 'MIGRATE_WORKER', nodeId: 'a', targetNodeId: 'b', workerId: 'w' });
  assert.equal(graph.nodes[1].workers.length, 0); assert.deepEqual(graph.nodes[2].workers[0].memory, { key: 1 });
  mutate(graph, { type: 'CHANGE_BUDGET', nodeId: 'a', budgetDelta: { tokens: -10 } });
  assert.equal(graph.nodes[1].budget.tokens, 30);
  assert.throws(() => applyOperation(graph, { type: 'CHANGE_BUDGET', nodeId: 'a', budgetDelta: { tokens: -40 } }), /budget/);
  mutate(graph, { type: 'RESIZE_POPULATION', nodeId: 'b', size: 2, newWorkers: [{ id: 'new' }] });
  assert.equal(graph.nodes[2].workers.length, 2);
  assert.throws(() => applyOperation(graph, { type: 'RESIZE_POPULATION', nodeId: 'b', size: 3 }), /admitted/);
  mutate(graph, { type: 'MIGRATE_STATE', fromNodeId: 'a', toNodeId: 'b', stateData: { key: 1 }, disposition: 'move' });
  assert.equal(graph.nodes[1].state.key, undefined); assert.equal(graph.nodes[2].state.key, 1);
  for (const type of ['FREEZE', 'THAW', 'QUIESCE']) mutate(graph, { type, nodeId: 'a' });
  mutate(graph, { type: 'CHANGE_TOPOLOGY', nodeId: 'a', newTopology: 'rhizome' });
  assert.equal(graph.nodes[1].variant, null);
  const before = structuredClone(graph);
  assert.throws(() => applyOperation(graph, { type: 'CHANGE_VARIANT', nodeId: 'missing', newVariant: 'adaptive' }), /Unknown/);
  assert.deepEqual(graph, before);
}
async function patchPipeline() {
  const graph = fresh();
  const patch = { baseGraphVersion: 1, operations: [{ type: 'CHANGE_VARIANT', nodeId: 'a', newVariant: 'adaptive' }],
    reason: 'verified trial', evidence: [], rollbackPlan };
  let executed = 0;
  const runtime = new MorphologyRuntime({ installTopologyPlugins: false });
  runtime.execute = async () => { executed++; return {}; };
  const adapters = { runtime, adjudicator: { adjudicate: async () => ({ approved: true }) }, verifier: { verify: async () => ({ valid: true }) } };
  const denied = await new PatchExecutor(adapters).execute(patch, graph);
  assert.equal(denied.success, false); assert.equal(executed, 0); assert.match(denied.error, /Isolated counterfactual/);
  const committed = await new PatchExecutor({ ...adapters, counterfactual: async () => ({ accepted: true }),
    committer: { commit: async () => ({ committed: true, receiptId: 'persisted' }) }
  }).execute(patch, graph);
  assert.equal(committed.success, true); assert.equal(committed.execution.commitResult.graph.version, 2);
  assert.equal(graph.version, 1); assert.equal(graph.nodes[1].variant, undefined);
  const stale = await new PatchExecutor({ ...adapters, counterfactual: async () => { graph.version = 2; return { accepted: true }; } }).execute(patch, graph);
  assert.equal(stale.success, false); assert.match(stale.error, /VERSION_CONFLICT/);
  graph.version = 1;
  const failed = await new PatchExecutor({ ...adapters, counterfactual: async () => ({ accepted: true }),
    snapshotter: { snapshot: async () => ({}), restore: async () => { throw new Error('restore failed'); } },
    verifier: { verify: async () => ({ valid: false }) }
  }).execute(patch, graph);
  assert.equal(failed.success, false); assert.equal(failed.execution.rolledBack, false);
  assert.equal(failed.execution.rollbackError, 'restore failed');
}
async function main() {
  structuralMutations(); nonStructuralMutations(); await patchPipeline();
  console.log('Morphogenesis patch completion: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
