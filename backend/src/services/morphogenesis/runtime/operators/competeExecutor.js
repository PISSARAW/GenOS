'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runCompete } = require('../../composition/compositionRuntime');

class CompeteExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 2) throw new Error('COMPETE requires at least 2 candidates');

    const budgets = this.allocateCompeteBudgets(context.budget, children.length);
    const results = [];

    await Promise.all(children.map(async (child, index) => {
      const childContext = {
        ...context,
        budget: budgets[index],
        state: { ...context.state }
      };

      const executor = this.runtime.getExecutor(child.kind);
      if (!executor) throw new Error(`No executor for candidate kind: ${child.kind}`);

      const result = await executor.execute(child, graph, childContext);
      context.evidence.push(...result.context.receipts);
      results.push({ candidate: child, ...result });
    }));

    const winner = this.selectWinner(results, node);
    const receipt = this.createReceipt(node, {
      candidates: results.map(r => ({ topology: r.candidate.topology, output: r.output, cost: r.context.budget })),
      winner: winner.candidate.topology,
      reason: winner.reason
    });

    return { output: winner.output, receipt, state: winner.context.state, winner: winner.candidate };
  }

  allocateCompeteBudgets(budget, count) {
    return Array.from({ length: count }, (_, i) => ({
      ...budget,
      tokens: budget.tokens ? budget.tokens / count : undefined,
      compute: budget.compute ? budget.compute / count : undefined
    }));
  }

  selectWinner(results, node) {
    const selector = node.selector || 'highest_score';
    switch (selector) {
      case 'highest_score':
        return results.reduce((best, r) => (r.output?.score || 0) > (best.output?.score || 0) ? r : best, results[0]);
      case 'lowest_cost':
        return results.reduce((best, r) => (r.context.budget?.tokens || 0) < (best.context.budget?.tokens || 0) ? r : best, results[0]);
      case 'best_evidence':
        return results.reduce((best, r) => (r.output?.evidenceScore || 0) > (best.output?.evidenceScore || 0) ? r : best, results[0]);
      default:
        return results[0];
    }
  }
}

module.exports = { CompeteExecutor };