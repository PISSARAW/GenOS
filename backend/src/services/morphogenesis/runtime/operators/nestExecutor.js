'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runNest } = require('../../composition/compositionRuntime');

class NestExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 2) throw new Error('NEST requires at least 2 children (host + inner)');

    const host = children[0];
    const inner = children.slice(1);

    const hostExecutor = this.runtime.getExecutorForNode(host);
    if (!hostExecutor) throw new Error(`No executor for host kind: ${host.kind}`);

    const hostResult = await hostExecutor.execute(host, graph, context);
    context.receipts.push(...hostResult.context.receipts);
    context.evidence.push(...hostResult.context.receipts);
    context.evidence.push(...hostResult.context.evidence);

    const innerContext = {
      ...context,
      input: hostResult.output,
      state: hostResult.context.state
    };

    const innerResults = await this.executeChildren(inner, graph, innerContext, { stopOnFailure: true });

    const lastResult = innerResults[innerResults.length - 1];
    const output = lastResult?.output;

    const receipt = this.createReceipt(node, {
      host: hostResult.output,
      inner: innerResults.map(r => r.output),
      finalOutput: output
    });

    return { output, receipt, state: lastResult?.context?.state || innerContext.state };
  }
}

module.exports = { NestExecutor };