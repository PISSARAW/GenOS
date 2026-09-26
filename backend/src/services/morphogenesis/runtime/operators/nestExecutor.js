'use strict';

const { BaseExecutor } = require('./baseExecutor');

function innerContextFor(parent, hostResult) {
  return {
    ...parent,
    input: hostResult.output,
    state: { ...hostResult.context.state },
    evidence: [],
    receipts: []
  };
}

function filterOutput(node, output) {
  const allowed = allowedKeys(node);
  if (!allowed || !output || typeof output !== 'object') return output;
  const filtered = {};
  for (const key of allowed) {
    if (output[key] !== undefined) filtered[key] = output[key];
  }
  return filtered;
}

function allowedKeys(node) {
  if (!Array.isArray(node.outputPorts) || node.outputPorts.length === 0) return null;
  return node.outputPorts.map((port) => port.name).filter(Boolean);
}

function collectHost(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

function collectInner(parent, child) {
  parent.receipts.push(...child.receipts);
  parent.evidence.push(...child.evidence);
}

class NestExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const children = this.getChildren(node, graph);
    if (children.length < 2) throw new Error('NEST requires at least 2 children (host + inner)');

    const host = children[0];
    const inner = children.slice(1);

    const hostExecutor = this.runtime.getExecutorForNode(host);
    if (!hostExecutor) throw new Error(`No executor for host kind: ${host.kind}`);

    const hostResult = await hostExecutor.execute(host, graph, context);
    collectHost(context, hostResult.context);

    const innerContext = innerContextFor(context, hostResult);

    const innerResults = await this.executeChildren(inner, graph, innerContext, { stopOnFailure: true });
    collectInner(context, innerContext);

    const lastResult = innerResults[innerResults.length - 1];
    const output = filterOutput(node, lastResult && lastResult.output);

    const receipt = this.createReceipt(node, {
      host: hostResult.output,
      inner: innerResults.map((entry) => entry.output),
      finalOutput: output,
      authorityIntersected: true
    });

    const state = lastResult && lastResult.context ? lastResult.context.state : innerContext.state;
    return { output, receipt, state };
  }
}

module.exports = { NestExecutor };