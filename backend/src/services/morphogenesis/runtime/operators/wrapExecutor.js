'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runWrap } = require('../../composition/compositionRuntime');

class WrapExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length !== 1) throw new Error('WRAP requires exactly 1 child');

    const [innerNode] = children;
    const environment = node.environment || {};

    const innerExecutor = this.runtime.getExecutorForNode(innerNode);
    if (!innerExecutor) throw new Error(`No executor for inner kind: ${innerNode.kind}`);

    const executeInner = () => innerExecutor.execute(innerNode, graph, context);

    let result;
    if (typeof environment.wrap === 'function') {
      result = await environment.wrap(executeInner, context);
    } else {
      result = await executeInner();
    }

    context.receipts.push(...result.context.receipts);
      context.evidence.push(...result.context.receipts);
      context.evidence.push(...result.context.evidence);

    const receipt = this.createReceipt(node, {
      environment: environment.name || 'custom',
      innerOutput: result.output,
      environmentOutput: result.environmentOutput
    });

    return { output: result.output, receipt, state: result.context.state, environment: environment.name };
  }
}

module.exports = { WrapExecutor };