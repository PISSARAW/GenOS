'use strict';

const { BaseExecutor } = require('./baseExecutor');

function stepReceipt(step, child, result) {
  return { nodeId: child.nodeId, topology: child.topology, status: result.context.status, receipt: result.receipt };
}

function blockedReceipt(step, child, reason) {
  return { nodeId: child.nodeId, topology: child.topology, status: 'blocked', reason };
}

function gateBlocked(output, policy) {
  if (!output) return true;
  if (policy.minConfidence && output.confidence < policy.minConfidence) return true;
  if (policy.requiredClaims && !hasClaims(output, policy)) return true;
  return false;
}

function hasClaims(output, policy) {
  return policy.requiredClaims.every((claim) => output.claims && output.claims.includes(claim));
}

function collectStep(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

function advanceStep(parent, result) {
  parent.input = result.output;
  parent.state = { ...parent.state, ...result.context.state };
  parent.budget = result.context.budget;
}

function collectInto(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

class SequenceExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length === 0) throw new Error('SEQUENCE requires at least 1 child');

    const currentContext = { ...context, evidence: [], receipts: [] };
    const steps = [];

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const step = await this.runStep(child, graph, currentContext, index);
      steps.push(step.receipt);
      if (step.blocked) break;
    }

    const lastResult = steps.length > 0 ? steps[steps.length - 1] : null;
    const receipt = this.createReceipt(node, { steps, blocked: steps.some((step) => step.status === 'blocked') });
    collectInto(context, currentContext);

    return { output: lastResult && lastResult.output, receipt, state: currentContext.state };
  }

  async runStep(child, graph, currentContext, index) {
    const executor = this.runtime.getExecutorForNode(child);
    if (!executor) throw new Error(`No executor for child kind: ${child.kind}`);
    const result = await executor.execute(child, graph, currentContext);
    collectStep(currentContext, result.context);
    const policy = child.evidencePolicy;
    if (policy && policy.required && gateBlocked(result.output, policy)) {
      return { receipt: blockedReceipt(index, child, 'evidence gate rejected'), blocked: true };
    }
    advanceStep(currentContext, result);
    return { receipt: { ...stepReceipt(index, child, result), output: result.output }, blocked: false, output: result.output };
  }
}

module.exports = { SequenceExecutor };