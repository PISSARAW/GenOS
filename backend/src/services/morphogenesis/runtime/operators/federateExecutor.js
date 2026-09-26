'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { allocateBudget } = require('./executionContext');

function memberContext(context, child, budget) {
  return {
    ...context,
    budget,
    state: { ...context.state },
    evidence: [],
    receipts: [],
    authority: intersectAuthority(context.authority, child.authorityBoundary)
  };
}

function intersectAuthority(parent, child) {
  if (!Array.isArray(parent)) return Array.isArray(child) ? [...child] : [];
  if (!Array.isArray(child)) return [...parent];
  return parent.filter((right) => child.includes(right));
}

function federateBudgets(budget, count) {
  return Array.from({ length: count }, () => allocateBudget(budget, 1 / count));
}

function detectDispute(values) {
  if (values.length < 2) return false;
  const first = JSON.stringify(values[0]);
  return values.some((value) => JSON.stringify(value) !== first);
}

class FederateExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 2) throw new Error('FEDERATE requires at least 2 members');

    const quorum = node.quorum || Math.ceil(children.length / 2);
    const budgets = federateBudgets(context.budget, children.length);
    const settled = await Promise.allSettled(children.map((child, index) => this.runMember(child, graph, context, budgets[index])));
    const succeeded = settled.filter((entry) => entry.status === 'fulfilled');
    mergeSucceeded(context, succeeded);

    const successful = succeeded.map((entry) => entry.value).filter((entry) => entry.context.status === 'completed');
    const quorumMet = successful.length >= quorum;
    if (!quorumMet) throw new Error(`FEDERATE quorum not met: ${successful.length}/${quorum}`);

    const values = successful.map((entry) => entry.output);
    const dispute = detectDispute(values);
    const mergedValue = await this.mergeResults(successful, node.mergeStrategy);
    const receipt = this.createReceipt(node, {
      members: settled.map((entry, index) => memberSummary(children[index], entry)),
      quorum,
      quorumMet,
      successful: successful.length,
      left: settled.length - succeeded.length,
      dispute,
      disputeResolution: dispute ? (node.mergeStrategy || 'consensus') : null,
      mergeStrategy: node.mergeStrategy || 'consensus'
    });

    return { output: mergedValue, receipt, state: mergeStates(successful.map((entry) => entry.context.state)), quorumMet };
  }

  async runMember(child, graph, context, budget) {
    const executor = this.runtime.getExecutorForNode(child);
    if (!executor) throw new Error(`No executor for member kind: ${child.kind}`);
    return executor.execute(child, graph, memberContext(context, child, budget));
  }

  async mergeResults(results, strategy) {
    const values = results.map((entry) => entry.output).filter((value) => value !== undefined);
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];
    if (strategy === 'majority') return this.majorityMerge(values);
    if (strategy === 'first') return values[0];
    if (strategy === 'all') return values;
    return this.consensusMerge(values);
  }

  consensusMerge(values) {
    const keys = new Set(values.flatMap(v => Object.keys(v || {})));
    const merged = {};
    for (const key of keys) {
      const keyValues = values.map(v => v[key]).filter(v => v !== undefined);
      if (keyValues.every(v => v === keyValues[0])) {
        merged[key] = keyValues[0];
      }
    }
    return merged;
  }

  majorityMerge(values) {
    const counts = new Map();
    for (const value of values) {
      const key = JSON.stringify(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let maxCount = 0, winner = values[0];
    for (const [key, count] of counts) {
      if (count > maxCount) { maxCount = count; winner = JSON.parse(key); }
    }
    return winner;
  }
}

function mergeStates(states) {
  return Object.assign({}, ...states.filter(Boolean));
}

function mergeSucceeded(parent, succeeded) {
  for (const entry of succeeded) {
    parent.receipts.push(...entry.value.context.receipts);
    parent.evidence.push(...entry.value.context.receipts);
    parent.evidence.push(...entry.value.context.evidence);
  }
}

function memberSummary(child, entry) {
  if (entry.status === 'rejected') return { nodeId: child.nodeId, topology: child.topology, status: 'failed', joined: false };
  return { nodeId: child.nodeId, topology: child.topology, status: entry.value.context.status, joined: true };
}

module.exports = { FederateExecutor };