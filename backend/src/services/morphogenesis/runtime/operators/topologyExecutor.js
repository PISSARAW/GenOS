'use strict';

const { BaseExecutor } = require('./baseExecutor');

class TopologyExecutor extends BaseExecutor {
  async executeNode(node, graph, context) {
    const topology = node.topology;
    const variant = node.variant;
    const workers = node.workers || [];

    const executor = this.runtime.topologyExecutors?.[topology];
    if (!executor) {
      return this.executeDefaultTopology(topology, variant, workers, context);
    }

    const result = await executor.execute({ topology, variant, workers }, context);
    const receipt = this.createReceipt(node, { topology, variant, workers: workers.length });

    return { output: result, receipt, state: result?.state };
  }

  async executeDefaultTopology(topology, variant, workers, context) {
    const topologyImpl = this.runtime.topologyRegistry?.[topology];
    if (!topologyImpl) {
      throw new Error(`Topology not registered: ${topology}`);
    }

    const raw = await topologyImpl.run({ variant, workers }, context);
    const output = raw && raw.output !== undefined ? raw.output : raw;
    const state = raw && raw.state !== undefined ? raw.state : context.state;
    return { output, receipt: null, state };
  }
}

module.exports = { TopologyExecutor };