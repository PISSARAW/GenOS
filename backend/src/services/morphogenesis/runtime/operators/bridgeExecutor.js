'use strict';

const { BaseExecutor } = require('./baseExecutor');

function checkContract(translated, adapter) {
  const contract = adapter && adapter.contract;
  if (!contract || !Array.isArray(contract.requiredOutputs)) return;
  const missing = contract.requiredOutputs.filter((key) => translated === null || translated === undefined || translated[key] === undefined);
  if (missing.length > 0) throw new Error(`BRIDGE contract violated, missing: ${missing.join(', ')}`);
}

function lossOf(adapter, source, translated) {
  if (adapter && Number.isFinite(adapter.lossEstimate)) return adapter.lossEstimate;
  if (!source || !translated || typeof source !== 'object' || typeof translated !== 'object') return 0;
  const sourceKeys = Object.keys(source).length;
  if (sourceKeys === 0) return 0;
  const kept = Object.keys(translated).filter((key) => source[key] !== undefined).length;
  return 1 - kept / sourceKeys;
}

function provenanceOf(node, adapter, sourceNode, targetNode) {
  return { bridgeNodeId: node.nodeId, adapter: adapter.name || 'custom', from: sourceNode.nodeId, to: targetNode.nodeId, at: new Date().toISOString() };
}

function collectSource(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

function collectTarget(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

class BridgeExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length !== 2) throw new Error('BRIDGE requires exactly 2 children: source and target');

    const [sourceNode, targetNode] = children;
    const adapter = node.adapter || { transform: 'passthrough' };

    const sourceExecutor = this.runtime.getExecutorForNode(sourceNode);
    if (!sourceExecutor) throw new Error(`No executor for source kind: ${sourceNode.kind}`);

    const sourceContext = { ...context, evidence: [], receipts: [] };
    const sourceResult = await sourceExecutor.execute(sourceNode, graph, sourceContext);
    collectSource(context, sourceResult.context);

    const translated = await this.applyAdapter(sourceResult.output, adapter, context);
    checkContract(translated, adapter);

    const targetExecutor = this.runtime.getExecutorForNode(targetNode);
    if (!targetExecutor) throw new Error(`No executor for target kind: ${targetNode.kind}`);

    const targetContext = { ...context, input: translated, evidence: [], receipts: [] };
    const targetResult = await targetExecutor.execute(targetNode, graph, targetContext);
    collectTarget(context, targetResult.context);

    const receipt = this.createReceipt(node, {
      sourceOutput: sourceResult.output,
      translated,
      adapter: adapter.name || 'custom',
      lossEstimate: lossOf(adapter, sourceResult.output, translated),
      provenance: provenanceOf(node, adapter, sourceNode, targetNode)
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
        return this.toTransferBundle(output, context);
      default:
        return output;
    }
  }

  toTransferBundle(output, context) {
    return {
      mission: context && context.missionId,
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