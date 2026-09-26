'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { allocateBudget } = require('./executionContext');

function comparableBudgets(budgets) {
  const values = budgets.map((budget) => numericToken(budget)).filter((value) => value > 0);
  if (values.length < 2) return true;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max / min <= 2;
}

function numericToken(budget) {
  if (!budget) return 0;
  if (Number.isFinite(budget.tokens)) return budget.tokens;
  const numbers = Object.values(budget).filter((value) => Number.isFinite(value));
  return numbers.length > 0 ? numbers[0] : 0;
}

function scoreOf(output, selector) {
  if (!output || typeof output !== 'object') return 0;
  if (selector === 'lowest_cost') return 0;
  if (selector === 'best_evidence' && Number.isFinite(output.evidenceScore)) return output.evidenceScore;
  if (Number.isFinite(output.score)) return output.score;
  if (Number.isFinite(output.confidence)) return output.confidence;
  return 0;
}

class CompeteExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 2) throw new Error('COMPETE requires at least 2 candidates');

    const budgets = this.allocateCompeteBudgets(context.budget, children.length);
    if (!comparableBudgets(budgets)) throw new Error('COMPETE requires comparable candidate budgets');
    const settled = await Promise.allSettled(children.map((child, index) => this.runCandidate(child, graph, context, budgets[index])));
    const succeeded = settled.filter((entry) => entry.status === 'fulfilled');
    if (succeeded.length === 0) throw new Error('COMPETE all candidates failed');
    mergeSucceeded(context, succeeded);

    const winner = this.selectWinner(succeeded.map((entry) => entry.value), node);
    const receipt = this.createReceipt(node, {
      protocol: node.selector || 'highest_score',
      candidates: succeeded.map((entry) => candidateSummary(entry.value)),
      winner: winner.candidate.topology,
      winnerNodeId: winner.candidate.nodeId,
      reason: winnerReason(node, winner),
      comparableBudgets: true
    });

    return { output: winner.output, receipt, state: winner.context.state, winner: winner.candidate };
  }

  async runCandidate(child, graph, context, budget) {
    const executor = this.runtime.getExecutorForNode(child);
    if (!executor) throw new Error(`No executor for candidate kind: ${child.kind}`);
    const childContext = { ...context, input: context.input, budget, state: {}, evidence: [], receipts: [] };
    const result = await executor.execute(child, graph, childContext);
    return { candidate: child, ...result };
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
    if (selector === 'lowest_cost') return lowestCost(results);
    if (selector === 'best_evidence') return bestEvidence(results);
    return highestScore(results, selector);
  }
}

function lowestCost(results) {
  return results.reduce((best, entry) => costOf(entry) < costOf(best) ? entry : best, results[0]);
}

function costOf(entry) {
  return entry.context.budget && entry.context.budget.tokens ? entry.context.budget.tokens : 0;
}

function bestEvidence(results) {
  return results.reduce((best, entry) => scoreOf(entry.output, 'best_evidence') > scoreOf(best.output, 'best_evidence') ? entry : best, results[0]);
}

function highestScore(results, selector) {
  return results.reduce((best, entry) => scoreOf(entry.output, selector) > scoreOf(best.output, selector) ? entry : best, results[0]);
}

function mergeSucceeded(parent, succeeded) {
  for (const entry of succeeded) {
    parent.receipts.push(...entry.value.context.receipts);
    parent.evidence.push(...entry.value.context.receipts);
    parent.evidence.push(...entry.value.context.evidence);
  }
}

function candidateSummary(entry) {
  return { nodeId: entry.candidate.nodeId, topology: entry.candidate.topology, output: entry.output, cost: entry.context.budget };
}

function winnerReason(node, winner) {
  return `selected by ${node.selector || 'highest_score'} among ${winner.candidate.topology} candidates`;
}

module.exports = { CompeteExecutor };