const {
  plasticity,
  speciation
} = require('./naturalSearchActuatorPrimitives');

const { ActuatorModules } = require('./actuatorModules');

class NaturalSearchActuator {
  constructor(options = {}) {
    this.db = options.db || null;
    this.persistence = options.persistence || null;
    this.ledger = options.ledger || null;
    this.searchGenome = options.searchGenome || { patches: new Map(), population: null, genome: null };
    this.maxReceipts = 50;
    this.receipts = [];
    this.modules = options.modules || new ActuatorModules({ ledger: this.ledger });
  }

  async forage(context) {
    const receipt = {
      id: `forage_${Date.now()}`,
      process: 'FORAGE',
      timestamp: Date.now(),
      action: null,
      result: null,
      status: 'success'
    };

    try {
      const agentId = context.agentId;
      const patch = this.modules.ensurePatch(agentId);
      const elapsedTimeSec = context.elapsedTimeSec || 10;

      const infoGain = 0.05 + Math.random() * 0.1;
      this.modules.recordForageStep(patch.id, infoGain, 1);

      if (this.modules.shouldDepartPatch(patch.id, elapsedTimeSec)) {
        receipt.action = 'PATCH_DEPARTURE';
        receipt.result = {
          departed: true,
          patchId: patch.id,
          visits: patch.visits,
          reason: 'marginal yield below threshold'
        };
        const updatedPatch = this.modules.patchService.patches.get(patch.id);
        if (updatedPatch) {
          updatedPatch.history = [];
          updatedPatch.visits = 0;
        }
      } else {
        receipt.action = 'PATCH_CONTINUE';
        receipt.result = {
          departed: false,
          patchId: patch.id,
          visits: patch.visits,
          infoGain: Number(infoGain.toFixed(4)),
          reason: 'yield still acceptable'
        };
      }
    } catch (err) {
      receipt.status = 'failure';
      receipt.result = { error: err.message };
    }

    this.recordReceipt(receipt);
    if (this.persistence && receipt.result && receipt.result.patchId) {
      try {
        await this.persistence.savePatchVisit(context.agentId, receipt.result.patchId,
          receipt.result.infoGain || 0, receipt.result.departed || false);
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
    const receipt = {
      id: `clonal_${Date.now()}`,
      process: 'CLONAL_AFFINITY_SEARCH',
      timestamp: Date.now(),
      action: 'VARIANTS_CREATED',
      result: null,
      status: 'success'
    };

    try {
      const baseHypothesis = context.baseHypothesis || { id: 'base', statement: 'Hypothèse de base' };
      const variants = this.modules.createAffinityVariants(null, 4, 'minimal');
      const best = this.modules.selectAffinityVariant(variants, context.agentId);

      receipt.result = {
        baseHypothesis: baseHypothesis.statement,
        variantsCreated: variants.length,
        variants: variants.map(v => ({ id: v.id, statement: v.statement || v.hypothesisFamily })),
        selectedVariant: best.id,
        selectionScore: best.score || 0
      };

      if (this.ledger && best) {
        try {
          const h = this.ledger.propose({
            agentId: context.agentId,
            statement: best.statement || `${best.hypothesisFamily} variant`,
            confidence: 0.5
          });
          receipt.result.proposedHypothesisId = h.id;
        } catch (ledgerErr) {
          receipt.result.ledgerNote = `Ledger propose skipped: ${ledgerErr.message}`;
        }
      }
    } catch (err) {
      receipt.status = 'failure';
      receipt.result = { error: err.message };
    }

    this.recordReceipt(receipt);
    if (this.persistence && receipt.result) {
      try {
        await this.persistence.saveDecision(context.agentId, {
          process: 'CLONAL_AFFINITY_SEARCH',
          classification: 'CLONAL_AFFINITY',
          pressure: 0.5,
          searchYield: 0.1,
          stepsSinceProgress: 0,
          falsifiedHypotheses: 0,
          diagnostics: { selectedVariant: receipt.result?.selectedVariant }
        });
      } catch (_) {}
    }
    return receipt;
  }

  async hypermutation(context) {
    const receipt = {
      id: `hyper_${Date.now()}`,
      process: 'STRESS_HYPERMUTATION',
      timestamp: Date.now(),
      action: 'GENOME_MUTATED',
      result: null,
      status: 'success'
    };

    try {
      const mutationResult = this.modules.mutateGenome(context.radius || 'medium');
      receipt.result = {
        genomeId: mutationResult.mutatedGenome.id,
        radius: context.radius || 'medium',
        mutations: mutationResult.mutations,
        oldFamily: mutationResult.oldGenome.hypothesisFamily,
        newFamily: mutationResult.mutatedGenome.hypothesisFamily
      };
      this.searchGenome.genome = mutationResult.mutatedGenome;
    } catch (err) {
      receipt.status = 'failure';
      receipt.result = { error: err.message };
    }

    this.recordReceipt(receipt);
    if (this.persistence && receipt.result && receipt.result.genomeId) {
      try {
        await this.persistence.saveGenomeSnapshot(context.agentId, 'STRESS_HYPERMUTATION',
          this.searchGenome.genome, receipt.result.mutations);
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
    const receipt = {
      id: `evolution_${Date.now()}`,
      process: 'EVOLUTION',
      timestamp: Date.now(),
      action: 'POPULATION_EVOLVED',
      result: null,
      status: 'success'
    };

    try {
      const env = {
        successfulFamilies: context.successfulFamilies || [],
        failedFamilies: context.failedFamilies || [],
        recommendedStrategies: context.recommendedStrategies || []
      };
      const evolutionResult = this.modules.evolveSearchPopulation(env);

      receipt.result = {
        initialPopulation: context.population || 10,
        generations: context.generations || 3,
        evolvedPopulation: this.modules.evolutionEngine.population.length,
        evolutionLog: evolutionResult,
        bestGenome: this.modules.getBestGenome()
      };
      this.searchGenome.population = this.modules.evolutionEngine.population;
    } catch (err) {
      receipt.status = 'failure';
      receipt.result = { error: err.message };
    }

    this.recordReceipt(receipt);
    if (this.persistence && receipt.result && receipt.result.evolutionLog) {
      try {
        await this.persistence.saveGenomeSnapshot(context.agentId, 'EVOLUTION',
          { population: this.searchGenome.population }, receipt.result.evolutionLog);
      } catch (_) {}
    }
    return receipt;
  }

  async replayCausal(context) {
    const receipt = {
      id: `replay_${Date.now()}`,
      process: 'REPLAY_CAUSAL',
      timestamp: Date.now(),
      action: 'REPLAY_INITIATED',
      result: null,
      status: 'success'
    };

    try {
      const failedHypothesis = context.lockInHypothesis || { id: 'unknown', statement: 'unknown' };
      const events = context.events || [];
      const ledger = this.ledger;
      const replayResult = await this.modules.replayCausalEvents(context.agentId, failedHypothesis, events, ledger);

      receipt.action = replayResult.receipt?.action || 'REPLAY_INITIATED';
      receipt.result = {
        restorePoint: replayResult.receipt?.result?.restorePoint || context.lastKnownGood || 'last_checkpoint',
        stateRestored: replayResult.receipt?.result?.stateRestored || false,
        checkpointIndex: replayResult.receipt?.result?.checkpointIndex ?? -1,
        checkpointCount: replayResult.receipt?.result?.checkpointCount ?? 0
      };
    } catch (err) {
      receipt.status = 'failure';
      receipt.result = { error: err.message };
    }

    this.recordReceipt(receipt);
    if (this.persistence && receipt.result) {
      try {
        await this.persistence.saveReplayLog(context.agentId, receipt.result.restorePoint,
          receipt.result.stateRestored, null);
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
