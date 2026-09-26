'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runSequence } = require('../../composition/compositionRuntime');

class SequenceExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length === 0) throw new Error('SEQUENCE requires at least 1 child');

    const gates = children.map(child => child.evidencePolicy ? this.createGateFn(child.evidencePolicy) : null);

    const currentContext = { ...context };
    const results = [];

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (gates[i]) {
        const gateResult = await gates[i](currentContext, results);
        if (!gateResult) {
          results.push({ skipped: true, reason: 'gate rejected' });
          continue;
        }
      }

      const executor = this.runtime.getExecutorForNode(child);
      if (!executor) throw new Error(`No executor for child kind: ${child.kind}`);

      const result = await executor.execute(child, graph, currentContext);
      currentContext.receipts.push(...result.context.receipts);
      currentContext.evidence.push(...result.context.receipts);
      currentContext.evidence.push(...result.context.evidence);
      results.push(result);

      currentContext.input = result.output;
      currentContext.state = { ...currentContext.state, ...result.context.state };
      currentContext.budget = result.context.budget;
    }

    const lastResult = results[results.length - 1];
    const receipt = this.createReceipt(node, { steps: results.map(r => r.receipt) });

    return { output: lastResult?.output, receipt, state: currentContext.state };
  }

  createGateFn(policy) {
    return async (context, results) => {
      if (!policy.required) return true;
      const lastResult = results[results.length - 1];
      if (!lastResult) return false;
      return this.evaluateEvidence(lastResult.output, policy);
    };
  }

  evaluateEvidence(output, policy) {
    if (!output) return false;
    if (policy.minConfidence && output.confidence < policy.minConfidence) return false;
    if (policy.requiredClaims) {
      return policy.requiredClaims.every(claim => output.claims?.includes(claim));
    }
    return true;
  }
}

module.exports = { SequenceExecutor };