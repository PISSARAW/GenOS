'use strict';

const { ExecutorRegistry } = require('./operators/registry');
const { createExecutionContext } = require('./operators/executionContext');

function mergeChildEvidence(parent, child) {
  if (!child) return;
  if (Array.isArray(child.receipts)) parent.receipts.push(...child.receipts);
  if (Array.isArray(child.evidence)) parent.evidence.push(...child.evidence);
}

class MorphologyRuntime {
  constructor(options = {}) {
    this.topologyRegistry = options.topologyRegistry || {};
    this.topologyExecutors = options.topologyExecutors || {};
    this.executorRegistry = new ExecutorRegistry(this);
    this.globalBudget = options.globalBudget || {};
    this.globalInvariants = options.globalInvariants || [];
    this.eventHandlers = options.eventHandlers || {};
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
}

module.exports = { MorphologyRuntime };