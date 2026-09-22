const {
  forage,
  plasticity,
  clonalAffinity,
  hypermutation,
  speciation,
  evolution,
  replayCausal
} = require('./naturalSearchActuatorPrimitives');

class NaturalSearchActuator {
  constructor(options = {}) {
    this.db = options.db || null;
    this.persistence = options.persistence || null;
    this.ledger = options.ledger || null;
    this.searchGenome = options.searchGenome || { patches: new Map(), population: null, genome: null };
    this.maxReceipts = 50;
    this.receipts = [];
  }

  async forage(context) {
    const receipt = await forage(context, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    if (this.persistence && receipt.result && receipt.result.patchId) {
      try {
        await this.persistence.savePatchVisit(context.agentId, receipt.result.patchId, receipt.result.infoGain || 0, receipt.result.departed || false);
      } catch (_) {}
    }
    return receipt;
  }

  async plasticity(context) {
    const receipt = await plasticity(context, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    return receipt;
  }

  async clonalAffinity(context) {
    const ctxWithLedger = { ...context, ledger: this.ledger };
    const receipt = await clonalAffinity(ctxWithLedger, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    return receipt;
  }

  async hypermutation(context) {
    const receipt = await hypermutation(context, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    if (this.persistence && receipt.result && receipt.result.genomeId) {
      try {
        await this.persistence.saveGenomeSnapshot(context.agentId, 'STRESS_HYPERMUTATION', this.searchGenome.genome, receipt.result.mutations);
      } catch (_) {}
    }
    return receipt;
  }

  async speciation(context) {
    const receipt = await speciation(context, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    return receipt;
  }

  async evolution(context) {
    const receipt = await evolution(context, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    if (this.persistence && receipt.result && receipt.result.evolvedPopulation) {
      try {
        await this.persistence.saveGenomeSnapshot(context.agentId, 'EVOLUTION', { population: this.searchGenome.population }, receipt.result.evolutionLog);
      } catch (_) {}
    }
    return receipt;
  }

  async replayCausal(context) {
    const receipt = await replayCausal(context, this.searchGenome, this.db);
    this.recordReceipt(receipt);
    if (this.persistence && receipt.result) {
      try {
        await this.persistence.saveReplayLog(context.agentId, receipt.result.restorePoint || 'unknown', receipt.result.stateRestored || false, receipt.result.snapshotId);
      } catch (_) {}
    }
    return receipt;
  }

  async continue(context) {
    const receipt = {
      id: `continue_${Date.now()}`,
      process: 'CONTINUE',
      timestamp: Date.now(),
      action: 'NO_OP',
      result: { adjusted: false },
      status: 'success'
    };
    this.recordReceipt(receipt);
    return receipt;
  }

  async execute(process, context) {
    switch (process) {
      case 'FORAGE': return this.forage(context);
      case 'PLASTICITE': return this.plasticity(context);
      case 'CLONAL_AFFINITY_SEARCH': return this.clonalAffinity(context);
      case 'REPLAY_CAUSAL': return this.replayCausal(context);
      case 'STRESS_HYPERMUTATION': return this.hypermutation(context);
      case 'SPECIATION': return this.speciation(context);
      case 'EVOLUTION': return this.evolution(context);
      default: return this.continue(context);
    }
  }

  recordReceipt(receipt) {
    this.receipts.push(receipt);
    if (this.receipts.length > this.maxReceipts) this.receipts.shift();
  }

  getReceipts() { return this.receipts.slice(); }
  clearReceipts() { this.receipts = []; }
}

module.exports = { NaturalSearchActuator };
