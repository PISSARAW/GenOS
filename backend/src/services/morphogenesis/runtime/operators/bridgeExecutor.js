'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { runBridge } = require('../../composition/compositionRuntime');

class BridgeExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length !== 2) throw new Error('BRIDGE requires exactly 2 children: source and target');

    const [sourceNode, targetNode] = children;
    const adapter = node.adapter || { transform: 'passthrough' };

    const sourceExecutor = this.runtime.getExecutorForNode(sourceNode);
    if (!sourceExecutor) throw new Error(`No executor for source kind: ${sourceNode.kind}`);

    const sourceResult = await sourceExecutor.execute(sourceNode, graph, context);
    context.receipts.push(...sourceResult.context.receipts);
    context.evidence.push(...sourceResult.context.receipts);
    context.evidence.push(...sourceResult.context.evidence);

    const translated = await this.applyAdapter(sourceResult.output, adapter, context);

    const targetExecutor = this.runtime.getExecutorForNode(targetNode);
    if (!targetExecutor) throw new Error(`No executor for target kind: ${targetNode.kind}`);

    const targetContext = { ...context, input: translated };
    const targetResult = await targetExecutor.execute(targetNode, graph, targetContext);
    context.receipts.push(...targetResult.context.receipts);
    context.evidence.push(...targetResult.context.receipts);
    context.evidence.push(...targetResult.context.evidence);

    const receipt = this.createReceipt(node, {
      sourceOutput: sourceResult.output,
      translated,
      adapter: adapter.name || 'custom',
      lossEstimate: adapter.lossEstimate || 0
    });

    return { output: targetResult.output, receipt, state: targetResult.context.state, translated };
  }

  async applyAdapter(output, adapter, context) {
    if (typeof adapter.transform === 'function') {
      return adapter.transform(output, context);
    }
    switch (adapter.transform) {
      case 'passthrough':
        return output;
      case 'extract_value':
        return output?.value ?? output;
      case 'extract_claims':
        return output?.claims ?? [];
      case 'extract_evidence':
        return output?.evidence ?? [];
      case 'to_transfer_bundle':
        return this.toTransferBundle(output);
      default:
        return output;
    }
  }

  toTransferBundle(output) {
    return {
      mission: context.missionId,
      artifacts: output?.artifacts || [],
      claims: output?.claims || [],
      evidence: output?.evidence || [],
      uncertainties: output?.uncertainties || [],
      decisions: output?.decisions || [],
      stateCapsules: output?.stateCapsules || [],
      provenance: output?.provenance || []
    };
  }
}

module.exports = { BridgeExecutor };