'use strict';

const { TopologyController } = require('./topologyController');

class SyncytiumController extends TopologyController {
  constructor(node, runtime) {
    super(node, runtime);
    this.sharedState = {};
    this.proposals = [];
    this.converged = false;
  }

  async compose(config = {}) {
    this.mergeStrategy = config.mergeStrategy || 'crdt';
    this.convergenceThreshold = config.convergenceThreshold || 0.95;
    return { mergeStrategy: this.mergeStrategy, threshold: this.convergenceThreshold };
  }

  async execute(input) {
    const { document = {}, operations = [] } = input;
    this.sharedState = document;

    for (const op of operations) {
      this.proposals.push({ author: op.author, content: op.content, timestamp: new Date().toISOString() });
      this.applyOperation(op);
    }

    this.converged = this.checkConvergence();

    return {
      merged_document: this.sharedState,
      proposals: this.proposals,
      converged: this.converged,
      consensus: this.extractConsensus()
    };
  }

  applyOperation(op) {
    if (op.type === 'set') this.sharedState[op.path] = op.value;
    else if (op.type === 'delete') delete this.sharedState[op.path];
  }

  checkConvergence() {
    return this.proposals.length === 0;
  }

  extractConsensus() {
    const consensus = {};
    for (const key of Object.keys(this.sharedState)) {
      consensus[key] = this.sharedState[key];
    }
    return consensus;
  }

  async observe() {
    const base = await super.observe();
    return {
      ...base,
      sharedStateKeys: Object.keys(this.sharedState).length,
      proposals: this.proposals.length,
      converged: this.converged
    };
  }

  async proposeAdaptation() {
    if (!this.converged && this.proposals.length > 10) {
      return [{ type: 'CHANGE_TOPOLOGY', to: 'trinity', reason: 'CRDT not converging, need adversarial review' }];
    }
    if (this.converged && Object.keys(this.sharedState).length > 50) {
      return [{ type: 'NEST', host: 'Syncytium', inner: 'Biocenose', reason: 'Converged state ready for jury review' }];
    }
    return null;
  }
}

module.exports = { SyncytiumController };