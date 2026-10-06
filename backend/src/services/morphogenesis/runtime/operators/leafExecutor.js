'use strict';
const { BaseExecutor } = require('./baseExecutor');

class LeafExecutor extends BaseExecutor {
  async executeNode(node, _graph, context) {
    const provider = this.runtime.nodeExecutors[node.kind];
    if (typeof provider?.execute !== 'function') throw new Error('Node executor required for kind: ' + node.kind);
    const result = await provider.execute({ node, input: context.input }, context);
    if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'output')) {
      throw new Error('Node executor must return an output envelope for ' + node.kind);
    }
    if (result.executionStatus === 'failed') throw new Error('Node execution failed: ' + node.nodeId);
    if (Array.isArray(result.evidence)) context.evidence.push(...result.evidence);
    return { output: result.output, state: result.state || context.state,
      receipt: this.createReceipt(node, { kind: node.kind, provider: provider.id || null }) };
  }
}
module.exports = { LeafExecutor };
