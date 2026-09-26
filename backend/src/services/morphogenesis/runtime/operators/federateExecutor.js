'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runFederate } = require('../../composition/compositionRuntime');

class FederateExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 2) throw new Error('FEDERATE requires at least 2 members');

    const quorum = node.quorum || Math.ceil(children.length / 2);
    const budgets = this.allocateFederateBudgets(context.budget, children.length);
    const results = [];

    await Promise.all(children.map(async (child, index) => {
      const childContext = {
        ...context,
        budget: budgets[index],
        state: { ...context.state },
        authority: this.intersectAuthority(context.authority, child.authorityBoundary)
      };

      const executor = this.runtime.getExecutor(child.kind);
      if (!executor) throw new Error(`No executor for member kind: ${child.kind}`);

      const result = await executor.execute(child, graph, childContext);
      context.evidence.push(...result.context.receipts);
      results.push({ member: child, ...result });
    }));

    const successful = results.filter(r => r.context.status === 'completed');
    const quorumMet = successful.length >= quorum;

    const mergedValue = await this.mergeResults(successful, node.mergeStrategy);
    const receipt = this.createReceipt(node, {
      members: results.map(r => ({ topology: r.member.topology, status: r.context.status })),
      quorum,
      quorumMet,
      successful: successful.length,
      mergeStrategy: node.mergeStrategy || 'consensus'
    });

    if (!quorumMet) {
      throw new Error(`FEDERATE quorum not met: ${successful.length}/${quorum}`);
    }

    return { output: mergedValue, receipt, state: mergeStates(successful.map(r => r.context.state)), quorumMet };
  }

  allocateFederateBudgets(budget, count) {
    return Array.from({ length: count }, () => ({
      ...budget,
      tokens: budget.tokens ? budget.tokens / count : undefined
    }));
  }

  intersectAuthority(parent, child) {
    if (!Array.isArray(parent)) return Array.isArray(child) ? [...child] : [];
    if (!Array.isArray(child)) return [...parent];
    return parent.filter(right => child.includes(right));
  }

  async mergeResults(results, strategy) {
    const values = results.map(r => r.output).filter(v => v !== undefined);
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];

    switch (strategy) {
      case 'consensus':
        return this.consensusMerge(values);
      case 'majority':
        return this.majorityMerge(values);
      case 'first':
        return values[0];
      case 'all':
        return values;
      default:
        return values;
    }
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

module.exports = { FederateExecutor };