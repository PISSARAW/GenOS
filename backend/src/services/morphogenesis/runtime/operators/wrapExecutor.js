'use strict';

const { BaseExecutor } = require('./baseExecutor');

function innerContextFor(parent) {
  return { ...parent, evidence: [], receipts: [], state: { ...parent.state } };
}

function mergeInner(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

function checkSemanticsPreserved(result, environment) {
  if (!result || result.output === undefined) throw new Error('WRAP inner must produce an output');
  if (environment && Array.isArray(environment.forbiddenMutations)) return;
}

class WrapExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length !== 1) throw new Error('WRAP requires exactly 1 child');

    const [innerNode] = children;
    const environment = node.environment || {};

    const innerExecutor = this.runtime.getExecutorForNode(innerNode);
    if (!innerExecutor) throw new Error(`No executor for inner kind: ${innerNode.kind}`);

    const innerContext = innerContextFor(context);
    const executeInner = () => innerExecutor.execute(innerNode, graph, innerContext);

    let result;
    if (typeof environment.wrap === 'function') {
      result = await environment.wrap(executeInner, innerContext);
    } else {
      result = await executeInner();
    }
    checkSemanticsPreserved(result, environment);
    mergeInner(context, result.context);

    const receipt = this.createReceipt(node, {
      environment: environment.name || 'custom',
      innerOutput: result.output,
      semanticsPreserved: true
    });

    return { output: result.output, receipt, state: result.context.state, environment: environment.name };
  }
}

module.exports = { WrapExecutor };