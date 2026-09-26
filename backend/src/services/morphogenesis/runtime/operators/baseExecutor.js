'use strict';

const { createChildContext, createReceipt, checkBudgetExhausted } = require('./executionContext');

function findNode(graph, nodeId) {
  return graph.nodes.find((node) => node.nodeId === nodeId);
}

function collectChildOutputs(parent, child) {
  if (!child) return;
  if (Array.isArray(child.receipts)) {
    parent.receipts.push(...child.receipts);
    parent.evidence.push(...child.receipts);
  }
  if (Array.isArray(child.evidence)) parent.evidence.push(...child.evidence);
}

class BaseExecutor {
  constructor(runtime) {
    this.runtime = runtime;
  }

  async execute(node, graph, context) {
    if (checkBudgetExhausted(context)) {
      throw new Error(`Budget exhausted for node ${node.nodeId}`);
    }

    const childContext = createChildContext(context, node);
    childContext.status = 'running';

    try {
      const result = await this.executeNode(node, graph, childContext);
      childContext.status = 'completed';
      childContext.output = result.output;
      childContext.completedAt = new Date().toISOString();

      if (result.receipt) {
        childContext.receipts.push(result.receipt);
      }

      return { ...result, context: childContext };
    } catch (error) {
      childContext.status = 'failed';
      childContext.error = error.message;
      childContext.completedAt = new Date().toISOString();
      throw error;
    }
  }

  async executeNode(node, graph, context) {
    throw new Error('executeNode must be implemented by subclass');
  }

  createReceipt(node, detail = {}) {
    return createReceipt({
      nodeId: node.nodeId,
      kind: node.operator || node.kind,
      output: detail,
      evidence: [],
      budget: node.budget || {}
    });
  }

  getChildren(node, graph) {
    if (Array.isArray(node.children) && node.children.length > 0) {
      return node.children.map((id) => findNode(graph, id)).filter(Boolean);
    }
    return graph.nodes.filter((child) => child.parentNodeId === node.nodeId);
  }

  async executeChildren(children, graph, context, options = {}) {
    const results = [];
    for (const child of children) {
      const executor = this.runtime.getExecutorForNode(child);
      if (!executor) throw new Error(`No executor for kind: ${child.kind}`);
      const result = await executor.execute(child, graph, context);
      results.push(result);
      collectChildOutputs(context, result.context);
      if (options.stopOnFailure && result.context.status === 'failed') break;
    }
    return results;
  }
}

module.exports = { BaseExecutor };