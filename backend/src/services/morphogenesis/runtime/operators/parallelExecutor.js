'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { allocateBudget } = require('./executionContext');

function divideBudget(budget, count) {
  if (!count || count <= 1) return [budget];
  return Array.from({ length: count }, () => allocateBudget(budget, 1 / count));
}

class ParallelExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length === 0) throw new Error('PARALLEL requires at least 1 child');

    const budgets = divideBudget(context.budget, children.length);
    const results = [];

    await Promise.all(children.map(async (child, index) => {
      const childContext = {
        ...context,
        budget: budgets[index],
        state: { ...context.state },
        evidence: [],
        receipts: []
      };

      const executor = this.runtime.getExecutorForNode(child);
      if (!executor) throw new Error(`No executor for child kind: ${child.kind}`);

      const result = await executor.execute(child, graph, childContext);
      context.receipts.push(...result.context.receipts);
      context.evidence.push(...result.context.receipts);
      context.evidence.push(...result.context.evidence);
      results.push(result);
    }));

    const output = results.map(r => r.output);
    const receipt = this.createReceipt(node, { branches: results.map(r => r.receipt) });

    return { output, receipt, state: mergeStates(results.map(r => r.context.state)) };
  }
}

function mergeStates(states) {
  return Object.assign({}, ...states.filter(Boolean));
}

module.exports = { ParallelExecutor };