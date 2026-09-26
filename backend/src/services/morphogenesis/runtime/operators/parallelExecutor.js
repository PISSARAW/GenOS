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
    const settled = await Promise.allSettled(children.map((child, index) => this.runBranch(child, graph, context, budgets[index])));
    const joined = joinBranches(children, settled);
    if (joined.failed.length > 0) throw branchFailure(joined.failed);
    mergeJoined(context, settled);
    const output = settled.map((entry) => entry.value.output);
    const receipt = this.createReceipt(node, { barrier: 'join-all', branches: joined.branches });

    return { output, receipt, state: mergeStates(settled.map((entry) => entry.value.context.state)) };
  }

  async runBranch(child, graph, context, budget) {
    const executor = this.runtime.getExecutorForNode(child);
    if (!executor) throw new Error(`No executor for child kind: ${child.kind}`);
    return executor.execute(child, graph, branchContext(context, budget));
  }
}

function branchContext(context, budget) {
  return {
    ...context,
    budget,
    state: { ...context.state },
    evidence: [],
    receipts: [],
    sharedResources: context.sharedResources || {}
  };
}

function mergeStates(states) {
  return Object.assign({}, ...states.filter(Boolean));
}

function joinBranches(children, settled) {
  const branches = settled.map((entry, index) => branchReceipt(children[index], entry));
  const failed = branches.filter((branch) => branch.status !== 'completed');
  return { branches, failed };
}

function branchReceipt(child, entry) {
  if (entry.status === 'rejected') {
    return { nodeId: child.nodeId, topology: child.topology, status: 'failed', error: errorMessage(entry.reason) };
  }
  return { nodeId: child.nodeId, topology: child.topology, status: 'completed', receipt: entry.value.receipt };
}

function errorMessage(reason) {
  return reason && reason.message ? reason.message : String(reason);
}

function branchFailure(failed) {
  return new Error(`PARALLEL join barrier failed: ${failed.map((branch) => branch.nodeId).join(', ')}`);
}

function mergeJoined(parent, settled) {
  for (const entry of settled) {
    if (entry.status !== 'fulfilled') continue;
    parent.receipts.push(...entry.value.context.receipts);
    parent.evidence.push(...entry.value.context.receipts);
    parent.evidence.push(...entry.value.context.evidence);
  }
}

module.exports = { ParallelExecutor };