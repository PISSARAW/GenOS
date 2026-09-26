'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runGate } = require('../../composition/compositionRuntime');

class GateExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 3) throw new Error('GATE requires 3 children: condition, thenBranch, elseBranch');

    const [conditionNode, thenNode, elseNode] = children;

    const conditionExecutor = this.runtime.getExecutorForNode(conditionNode);
    if (!conditionExecutor) throw new Error(`No executor for condition kind: ${conditionNode.kind}`);

    const conditionResult = await conditionExecutor.execute(conditionNode, graph, context);
    context.receipts.push(...conditionResult.context.receipts);
    context.evidence.push(...conditionResult.context.receipts);
    context.evidence.push(...conditionResult.context.evidence);

    const conditionMet = this.evaluateCondition(conditionResult.output, node);
    const branchNode = conditionMet ? thenNode : elseNode;
    const branchName = conditionMet ? 'then' : 'else';

    const branchExecutor = this.runtime.getExecutorForNode(branchNode);
    if (!branchExecutor) throw new Error(`No executor for branch kind: ${branchNode.kind}`);

    const branchContext = { ...context, input: conditionResult.output };
    const branchResult = await branchExecutor.execute(branchNode, graph, branchContext);
    context.receipts.push(...branchResult.context.receipts);
    context.evidence.push(...branchResult.context.receipts);
    context.evidence.push(...branchResult.context.evidence);

    const receipt = this.createReceipt(node, {
      condition: conditionResult.output,
      conditionMet,
      selectedBranch: branchName,
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