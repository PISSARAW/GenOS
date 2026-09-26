'use strict';

const { createChildContext, createReceipt, checkBudgetExhausted } = require('./executionContext');

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

  getChildren(node, graph) {
    return (node.children || []).map(childId => graph.nodes.find(n => n.nodeId === childId)).filter(Boolean);
  }

  async executeChildren(children, graph, context, options = {}) {
    const results = [];
    for (const child of children) {
      const executor = this.runtime.getExecutor(child.kind);
      if (!executor) throw new Error(`No executor for kind: ${child.kind}`);
      const result = await executor.execute(child, graph, context);
      results.push(result);
      context.evidence.push(...result.context.receipts);
      if (options.stopOnFailure && result.context.status === 'failed') break;
    }
    return results;
  }
}

module.exports = { BaseExecutor };