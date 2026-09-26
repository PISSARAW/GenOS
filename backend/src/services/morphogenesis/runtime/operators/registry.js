'use strict';

const { NestExecutor } = require('./nestExecutor');
const { ParallelExecutor } = require('./parallelExecutor');
const { SequenceExecutor } = require('./sequenceExecutor');
const { GateExecutor } = require('./gateExecutor');
const { CompeteExecutor } = require('./competeExecutor');
const { WrapExecutor } = require('./wrapExecutor');
const { BridgeExecutor } = require('./bridgeExecutor');
const { FederateExecutor } = require('./federateExecutor');
const { TopologyExecutor } = require('./topologyExecutor');

const EXECUTORS = {
  NEST: NestExecutor,
  PARALLEL: ParallelExecutor,
  SEQUENCE: SequenceExecutor,
  GATE: GateExecutor,
  COMPETE: CompeteExecutor,
  WRAP: WrapExecutor,
  BRIDGE: BridgeExecutor,
  FEDERATE: FederateExecutor,
  TOPOLOGY: TopologyExecutor,
  OPERATOR: null,
  ADAPTER: null,
  ENVIRONMENT: null,
  DIRECT_WORKER: null
};

class ExecutorRegistry {
  constructor(runtime) {
    this.runtime = runtime;
    this.executors = new Map();
    this.topologyRegistry = runtime.topologyRegistry || {};
    this.topologyExecutors = runtime.topologyExecutors || {};
    this._initialize();
  }

  _initialize() {
    for (const [kind, ExecutorClass] of Object.entries(EXECUTORS)) {
      if (ExecutorClass) {
        this.executors.set(kind, new ExecutorClass(this));
      }
    }
  }

  getExecutor(kind, operator = null) {
    const direct = this.executors.get(kind);
    if (direct) return direct;
    if (operator && this.executors.get(operator)) return this.executors.get(operator);

    if (kind === 'TOPOLOGY') {
      return this.executors.get('TOPOLOGY');
    }

    throw new Error(`No executor registered for kind: ${kind}`);
  }

  getExecutorForNode(node) {
    if (!node) throw new Error('getExecutorForNode requires a node');
    if (node.operator && this.executors.get(node.operator)) {
      return this.executors.get(node.operator);
    }
    return this.getExecutor(node.kind, node.operator);
  }

  registerTopology(topology, impl) {
    this.topologyRegistry[topology] = impl;
  }

  registerTopologyExecutor(topology, executor) {
    this.topologyExecutors[topology] = executor;
  }

  hasExecutor(kind) {
    return this.executors.has(kind);
  }

  getRegisteredKinds() {
    return Array.from(this.executors.keys());
  }
}

module.exports = { ExecutorRegistry, EXECUTORS };