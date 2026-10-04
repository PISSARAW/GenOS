'use strict';

const { BaseExecutor } = require('./baseExecutor');

class TopologyExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const topology = node.topology;
    const variant = node.variant;
    const workers = node.workers || [];

    const executor = this.runtime.topologyExecutors?.[topology];
    if (!executor) {
      const fallback = await this.executeDefaultTopology({ topology, variant, workers, graph, context });
      fallback.output = withTopologyOutcome(fallback.output);
      if (!fallback.receipt) fallback.receipt = this.createReceipt(node, leafSummary(topology, { variant, workers, output: fallback.output }));
      return fallback;
    }

    const result = await executor.execute({ topology, variant, workers }, context);
    const output = withTopologyOutcome(result);
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
    const output = raw && raw.output !== undefined ? raw.output : raw;
    const state = raw && raw.state !== undefined ? raw.state : context.state;
    return { output, receipt: null, state };
  }
}

function withTopologyOutcome(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const actionCount = Number.isFinite(output.actionCount) ? output.actionCount : null;
  return { ...output, ...outcomeDefaults(output, actionCount) };
}

function outcomeDefaults(output, actionCount) {
  return { executionStatus: executionStatus(output), contractStatus: contractStatus(output),
    evidenceStatus: evidenceStatus(output), missionOutcome: missionOutcome(output, actionCount) };
}

function executionStatus(output) {
  return output.executionStatus || 'completed';
}

function contractStatus(output) {
  return output.contractStatus || (output.workflow ? 'assessed' : 'not_assessed');
}

function evidenceStatus(output) {
  const verified = ({ PASS: true, FAIL: true })[output.verdict] === true;
  return output.evidenceStatus || (verified ? 'verified' : 'not_assessed');
}

function missionOutcome(output, actionCount) {
  const outcome = ({ PASS: 'verified', FAIL: 'failed' })[output.verdict]
    || (actionCount === 0 ? 'no_action' : 'unverified');
  return output.missionOutcome || outcome;
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
