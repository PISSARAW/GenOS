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
    this.sharedState = safeDocument(document);
    const conflicts = [];

    for (const op of operations) {
      const receipt = this.applyOperation(op);
      this.proposals.push(receipt);
      if (receipt.status !== 'APPLIED') conflicts.push(receipt);
    }

    this.converged = this.checkConvergence(conflicts);

    return {
      merged_document: this.sharedState,
      proposals: this.proposals,
      converged: this.converged,
      consensus: this.extractConsensus(), conflicts,
      executionMode: 'simulated_controller'
    };
  }

  applyOperation(op) {
    if (!op || !safeKey(op.path) || !['set', 'delete'].includes(op.type)) {
      return { operationId: op?.operationId || null, status: 'REJECTED', reason: 'INVALID_OPERATION' };
    }
    if (op.type === 'set') this.sharedState[op.path] = structuredClone(op.value);
    else delete this.sharedState[op.path];
    return { operationId: op.operationId || null, author: op.author || null,
      status: 'APPLIED', path: op.path };
  }

  checkConvergence(conflicts = []) {
    return this.proposals.length > 0 && conflicts.length === 0
      && this.proposals.every((item) => item.status === 'APPLIED');
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

function safeKey(value) {
  return typeof value === 'string' && value.length > 0
    && !['__proto__', 'prototype', 'constructor'].includes(value);
}

function safeDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!safeKey(key)) throw Object.assign(new Error('Unsafe Syncytium document key.'),
      { code: 'SYNCYTIUM_DOCUMENT_INVALID' });
    output[key] = structuredClone(item);
  }
  return output;
}

module.exports = { SyncytiumController };
