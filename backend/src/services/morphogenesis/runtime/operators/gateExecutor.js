'use strict';

const { BaseExecutor } = require('./baseExecutor');

function confidenceOf(output) {
  if (typeof output === 'boolean') return output ? 1 : 0;
  if (output && typeof output.confidence === 'number') return output.confidence;
  if (output && typeof output.score === 'number') return output.score;
  return 0.5;
}

function observationsOf(output) {
  if (!output || typeof output !== 'object') return { value: output };
  return { keys: Object.keys(output), confidence: confidenceOf(output) };
}

function decideBranch(conditionMet, thenNode, elseNode) {
  return conditionMet
    ? { selected: thenNode, rejected: elseNode, name: 'then' }
    : { selected: elseNode, rejected: thenNode, name: 'else' };
}

function reasonOf(node, branchName) {
  if (node.condition && node.condition.reason) return node.condition.reason;
  return `condition evaluated, selected ${branchName} branch`;
}

function collectResult(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

class GateExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 3) throw new Error('GATE requires 3 children: condition, thenBranch, elseBranch');

    const [conditionNode, thenNode, elseNode] = children;

    const conditionExecutor = this.runtime.getExecutorForNode(conditionNode);
    if (!conditionExecutor) throw new Error(`No executor for condition kind: ${conditionNode.kind}`);

    const conditionContext = { ...context, evidence: [], receipts: [] };
    const conditionResult = await conditionExecutor.execute(conditionNode, graph, conditionContext);
    collectResult(context, conditionResult.context);

    const conditionMet = this.evaluateCondition(conditionResult.output, node);
    const decision = decideBranch(conditionMet, thenNode, elseNode);

    const branchExecutor = this.runtime.getExecutorForNode(decision.selected);
    if (!branchExecutor) throw new Error(`No executor for branch kind: ${decision.selected.kind}`);

    const branchContext = { ...context, input: conditionResult.output, evidence: [], receipts: [] };
    const branchResult = await branchExecutor.execute(decision.selected, graph, branchContext);
    collectResult(context, branchResult.context);

    const receipt = this.createReceipt(node, {
      condition: conditionResult.output,
      observations: observationsOf(conditionResult.output),
      confidence: confidenceOf(conditionResult.output),
      selectedBranch: decision.name,
      selectedNodeId: decision.selected.nodeId,
      rejectedNodeId: decision.rejected.nodeId,
      reason: reasonOf(node, decision.name),
      branchOutput: branchResult.output
    });

    return { output: branchResult.output, receipt, state: branchResult.context.state };
  }

  evaluateCondition(output, node) {
    if (output === true || output === false) return output;
    if (output && typeof output === 'object') {
      if (node.condition?.expression) {
        return this.evalExpression(output, node.condition.expression);
      }
      return output.value !== false && output.value !== null && output.value !== undefined;
    }
    return !!output;
  }

  evalExpression(data, expr) {
    if (!expr || !data) return false;
    try {
      return new Function('data', `return ${expr}`)(data);
    } catch {
      return false;
    }
  }
}

module.exports = { GateExecutor };