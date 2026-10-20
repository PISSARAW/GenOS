'use strict';

const { BaseExecutor } = require('./baseExecutor');
const { withTopologyOutcome } = require('../topologyOutcome');

class TopologyExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const topology = node.topology;
    const variant = node.variant;
    const workers = node.workers || [];

    const executor = this.runtime.topologyExecutors?.[topology];
    if (!executor) {
      const fallback = await this.executeDefaultTopology({ topology, variant, workers, graph, context });
      fallback.output = withTopologyOutcome(fallback.output, { topology, variant });
      if (!fallback.receipt) fallback.receipt = this.createReceipt(node, leafSummary(topology, { variant, workers, output: fallback.output }));
      return fallback;
    }

    const result = await executor.execute({ topology, variant, workers }, context);
    if (Array.isArray(result?.evidence)) context.evidence.push(...result.evidence);
    const output = withTopologyOutcome(result, { topology, variant });
    const receipt = this.createReceipt(node, leafSummary(topology, { variant, workers, output }));

    return { output, receipt, state: result?.state };
  }

  async executeDefaultTopology(input) {
    const { topology, variant, workers, graph, context } = input;
    const topologyImpl = this.runtime.topologyRegistry?.[topology];
    if (!topologyImpl) {
      throw new Error(`Topology not registered: ${topology}`);
    }

    const raw = await topologyImpl.run({ topology, variant, workers, mission: graph.missionId }, context);
    if (Array.isArray(raw?.evidence)) context.evidence.push(...raw.evidence);
    const output = raw && raw.output !== undefined ? raw.output : raw;
    const state = raw && raw.state !== undefined ? raw.state : context.state;
    return { output, receipt: null, state };
  }
}

function leafSummary(topology, { variant, workers, output }) {
  return { topology, variant: variant || null, workers: Array.isArray(workers) ? workers.length : 0, outputSummary: summarizeOutput(output) };
}

function summarizeOutput(output) {
  if (!output || typeof output !== 'object') return { value: output };
  const summary = {};
  for (const key of Object.keys(output)) summary[key] = Array.isArray(output[key]) ? `array(${output[key].length})` : typeof output[key];
  return summary;
}

module.exports = { TopologyExecutor };
