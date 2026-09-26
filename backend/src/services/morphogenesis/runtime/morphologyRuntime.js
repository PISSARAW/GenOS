'use strict';

const { ExecutorRegistry } = require('./operators/registry');
const { createExecutionContext } = require('./operators/executionContext');

function mergeChildEvidence(parent, child) {
  if (!child) return;
  if (Array.isArray(child.receipts)) parent.receipts.push(...child.receipts);
  if (Array.isArray(child.evidence)) parent.evidence.push(...child.evidence);
}

function recordExperience(store, graph, rootNode, result) {
  if (!store || typeof store.add !== 'function') return;
  try {
    store.add({
      missionSignature: graph.missionId || graph.graphId,
      problemProfile: {},
      initialMorphology: { topology: rootNode.topology, variant: rootNode.variant, operator: rootNode.operator },
      morphologyHistory: [{ version: graph.version, rootKind: rootNode.operator || rootNode.kind }],
      budget: graph.globalBudget || {},
      quality: 0,
      evidenceQuality: 0,
      finalOutcome: 'completed',
      failures: 0
    });
  } catch (_) { /* learning must never break execution */ }
}

function variantPatch(input) {
  const { createMorphologyPatch, createOperation } = require('../transitions/morphologyPatch');
  return createMorphologyPatch({
    baseGraphVersion: input.graph.version,
    operations: [createOperation('CHANGE_VARIANT', { nodeId: input.nodeId, newVariant: input.newVariant })],
    reason: input.reason || `Variant change to ${input.newVariant}`,
    evidence: input.evidence || [],
    expectedGain: {},
    expectedCost: {},
    rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] },
    authority: null,
    lease: null
  });
}

class MorphologyRuntime {
  constructor(options = {}) {
    this.topologyRegistry = options.topologyRegistry || {};
    this.topologyExecutors = options.topologyExecutors || {};
    this.executorRegistry = new ExecutorRegistry(this);
    this.globalBudget = options.globalBudget || {};
    this.globalInvariants = options.globalInvariants || [];
    this.eventHandlers = options.eventHandlers || {};
    this.experienceStore = options.experienceStore || null;
  }

  async execute(graph, input = {}) {
    const rootNode = graph.nodes.find(n => n.nodeId === graph.rootNodeId);
    if (!rootNode) throw new Error('Graph has no root node');

    const context = createExecutionContext({
      missionId: graph.missionId,
      graphId: graph.graphId,
      nodeId: rootNode.nodeId,
      budget: { ...this.globalBudget, ...graph.globalBudget },
      authority: ['*'],
      state: {},
      input: input
    });

    context.status = 'running';

    try {
      const executor = this.executorRegistry.getExecutorForNode(rootNode);
      if (!executor) throw new Error(`No executor for root kind: ${rootNode.kind}`);

      const result = await executor.execute(rootNode, graph, context);

      context.status = 'completed';
      context.output = result.output;
      context.completedAt = new Date().toISOString();
      mergeChildEvidence(context, result.context);

      this.emit('complete', { graph, result, context });
      recordExperience(this.experienceStore, graph, rootNode, result);

      return { output: result.output, receipts: context.receipts, evidence: context.evidence, state: result.context.state || context.state };
    } catch (error) {
      context.status = 'failed';
      context.error = error.message;
      context.completedAt = new Date().toISOString();

      this.emit('error', { graph, error, context });
      throw error;
    }
  }

  async executeNode(nodeId, graph, parentContext) {
    const node = graph.nodes.find(n => n.nodeId === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const executor = this.executorRegistry.getExecutorForNode(node);
    if (!executor) throw new Error(`No executor for kind: ${node.kind}`);

    return executor.execute(node, graph, parentContext);
  }

  getExecutor(kind, operator = null) {
    return this.executorRegistry.getExecutor(kind, operator);
  }

  getExecutorForNode(node) {
    return this.executorRegistry.getExecutorForNode(node);
  }

  registerTopology(topology, impl) {
    this.executorRegistry.registerTopology(topology, impl);
  }

  registerTopologyExecutor(topology, executor) {
    this.executorRegistry.registerTopologyExecutor(topology, executor);
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  emit(event, data) {
    const handlers = this.eventHandlers[event] || [];
    for (const handler of handlers) {
      try { handler(data); } catch (e) { console.error(`Event handler error for ${event}:`, e); }
    }
  }

  getExecutorRegistry() {
    return this.executorRegistry;
  }

  async applyPatch(patch, graph, execContext = {}) {
    const { PatchExecutor } = require('../transitions/patchExecutor');
    const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
    const { checkGraph } = require('../graph/morphologyTypeChecker');
    const { checkBudgets } = require('../graph/morphologyBudgetChecker');
    const executor = new PatchExecutor({
      runtime: this,
      verifier: { verify: verifyPatched }
    });
    return executor.execute(patch, graph, execContext);

    async function verifyPatched(input) {
      const errors = [];
      pushErrors(errors, validateMorphologyGraph(input.graph));
      pushErrors(errors, checkGraph({ graph: input.graph }));
      pushErrors(errors, checkBudgets({ graph: input.graph }));
      return { valid: errors.length === 0, errors };
    }

    function pushErrors(errors, result) {
      if (!result.valid) errors.push(...result.errors);
    }
  }

  async changeVariant(nodeId, graph, newVariant, execContext = {}) {
    const node = graph.nodes.find((entry) => entry.nodeId === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.variant === newVariant) return { success: true, changed: false };
    const patch = variantPatch({ graph, nodeId, newVariant, evidence: execContext.evidence || [] });
    const result = await this.applyPatch(patch, graph, execContext);
    return { success: result.success, changed: result.success, execution: result.execution };
  }
}

module.exports = { MorphologyRuntime };