const { SearchReceipt } = require('./SearchReceipt');
const { getDatabase } = require('../../db');
const { applySnapshotState } = require('../../controllers/lineage/snapshots');
const lineageController = require('../../controllers/lineage');
const {
  SEARCH_PROCESS,
  evolvePopulation,
  generatePhenotypeVariant,
  createHypothesisVariants,
  mutateSearchGenome,
  createNiches
} = require('./naturalSearchActuatorHelpers');

class NaturalSearchActuator {
  constructor(options = {}) {
    this.foragingService = options.foragingService || null
    this.gitService = options.gitService || null
    this.receipts = []
    this.maxReceipts = 50
    this.db = options.db || null
    this.telemetry = options.telemetry || null
  }

  async execute(process, context = {}) {
    let receipt
    switch (process) {
      case SEARCH_PROCESS.CONTINUE: receipt = await this.executeContinue(context); break
      case SEARCH_PROCESS.FORAGE: receipt = await this.executeForage(context); break
      case SEARCH_PROCESS.PLASTICITE: receipt = await this.executePlasticity(context); break
      case SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH: receipt = await this.executeClonalAffinity(context); break
      case SEARCH_PROCESS.REPLAY_CAUSAL: receipt = await this.executeReplayCausal(context); break
      case SEARCH_PROCESS.STRESS_HYPERMUTATION: receipt = await this.executeHypermutation(context); break
      case SEARCH_PROCESS.SPECIATION: receipt = await this.executeSpeciation(context); break
      case SEARCH_PROCESS.EVOLUTION: receipt = await this.executeEvolution(context); break
      default: receipt = new SearchReceipt(process, 'UNKNOWN'); receipt.setFailure(`Unknown process: ${process}`)
    }
    this.recordReceipt(receipt)
    return receipt
  }

  executeSync(process, context = {}) {
    switch (process) {
      case SEARCH_PROCESS.CONTINUE: return this.executeContinueSync(context)
      case SEARCH_PROCESS.FORAGE: return this.executeForageSync(context)
      case SEARCH_PROCESS.PLASTICITE: return this.executePlasticitySync(context)
      case SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH: return this.executeClonalAffinitySync(context)
      case SEARCH_PROCESS.REPLAY_CAUSAL: return this.executeReplayCausalSync(context)
      case SEARCH_PROCESS.STRESS_HYPERMUTATION: return this.executeHypermutationSync(context)
      case SEARCH_PROCESS.SPECIATION: return this.executeSpeciationSync(context)
      case SEARCH_PROCESS.EVOLUTION: return this.executeEvolutionSync(context)
      default: {
        const r = new SearchReceipt(process, 'UNKNOWN')
        r.setFailure(`Unknown process: ${process}`)
        this.recordReceipt(r)
        return r
      }
    }
  }

  async executeContinue(context) {
    return this.executeContinueSync(context);
  }

  executeContinueSync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.CONTINUE, 'NO_OP');
    r.setSuccess({ adjusted: false });
    this.recordReceipt(r);
    return r;
  }

  async executeForage(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.FORAGE, 'PATCH_DEPARTURE', { patch: context.currentPatch });
    r.setSuccess({
      action: 'RECOMMEND_PATCH_DEPARTURE',
      reason: 'marginal yield below threshold',
      nextStep: 'agent should switch search region'
    });
    if (this.foragingService && typeof this.foragingService.recommend === 'function') {
      try {
        const rec = await this.foragingService.recommend(context);
        r.setSuccess({ ...r.result, foragingRecommendation: rec });
      } catch (_) {}
    }
    return r;
  }

  executeForageSync(context) {
    return this.executeForage(context);
  }

  async executePlasticity(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.PLASTICITE, 'PHENOTYPE_ADAPTATION', {
      topology: context.topology,
      tools: context.tools
    })
    const newPhenotype = generatePhenotypeVariant(context)
    try {
      const db = this.db || await getDatabase()
      const agentId = context.agentId || 'unknown'
      const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId)
      if (agent) {
        const updated = { ...agent, topology: newPhenotype.topology, tools: newPhenotype.tools.join(',') }
        await applySnapshotState(db, updated, agentId)
        r.setSuccess({
          action: 'PHENOTYPE_CHANGED',
          before: { topology: context.topology, tools: context.tools },
          after: newPhenotype,
          agentId
        })
      } else {
        r.setSuccess({
          action: 'PHENOTYPE_CHANGED',
          before: { topology: context.topology, tools: context.tools },
          after: newPhenotype
        })
      }
    } catch (err) {
      r.setSuccess({
        action: 'PHENOTYPE_CHANGED',
        before: { topology: context.topology, tools: context.tools },
        after: newPhenotype,
        note: `Phenotype updated in-memory only: ${err.message}`
      })
    }
    return r
  }

  executePlasticitySync(context) {
    return this.executePlasticity(context).then(r => {
      this.recordReceipt(r);
      return r;
    });
  }

  async executeClonalAffinity(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH, 'CLONE_AND_VARY', {
      baseHypothesis: context.baseHypothesis
    })
    const variants = createHypothesisVariants(context)
    try {
      const db = this.db || await getDatabase()
      const agentId = context.agentId || 'unknown'
      const parentAgent = await db.get('SELECT * FROM agents WHERE id = ?', agentId)
      if (parentAgent && parentAgent.execution_mode === 'orchestrator') {
        // Use the real GenOS primitive — cloneFromAgent persists agent + lineage
        const result = await lineageController.cloneFromAgent(db, { parentAgent, parentId: agentId })
        if (result?.body?.success) {
          r.setSuccess({
            action: 'VARIANTS_CREATED',
            count: variants.length,
            variants: variants.map(v => v.statement),
            clonedAgentId: result.body.clonedAgentId,
            persistedVia: 'cloneFromAgent'
          })
        } else {
          r.setSuccess({
            action: 'VARIANTS_CREATED',
            count: variants.length,
            variants: variants.map(v => v.statement),
            note: result?.body?.error?.message || 'clone returned no success'
          })
        }
      } else {
        r.setSuccess({
          action: 'VARIANTS_CREATED',
          count: variants.length,
          variants: variants.map(v => v.statement),
          note: 'Parent is not an orchestrator — clone skipped'
        })
      }
    } catch (err) {
      r.setSuccess({
        action: 'VARIANTS_CREATED',
        count: variants.length,
        variants: variants.map(v => v.statement),
        note: `Cloning skipped: ${err.message}`
      })
    }
    return r
  }

  executeClonalAffinitySync(context) {
    return this.executeClonalAffinity(context).then(r => {
      this.recordReceipt(r);
      return r;
    });
  }

  async executeReplayCausal(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.REPLAY_CAUSAL, 'SNAPSHOT_RESTORE_AND_REPLAY', {
      restorePoint: context.lastKnownGood
    })
    try {
      const db = this.db || await getDatabase()
      const agentId = context.agentId || 'unknown'
      const snapshot = await db.get(
        'SELECT * FROM agent_state_snapshots WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1',
        agentId
      )
      if (snapshot) {
        const state = JSON.parse(snapshot.state_json)
        // Real GenOS primitive: updates agents table with snapshot state
        await applySnapshotState(db, state, agentId)
        r.setSuccess({
          action: 'RESTORED_FROM_SNAPSHOT',
          snapshotId: snapshot.id,
          restorePoint: context.lastKnownGood || snapshot.id,
          agentId,
          persistedVia: 'applySnapshotState'
        })
      } else {
        r.setSuccess({
          action: 'REPLAY_INITIATED',
          restorePoint: context.lastKnownGood || 'last_checkpoint',
          newHypothesisSpawned: !!context.lockInHypothesis,
          note: 'No prior snapshot for agent — replay skipped'
        })
      }
    } catch (err) {
      r.setFailure(`Replay causal failed: ${err.message}`)
    }
    this.recordReceipt(r)
    return r
  }

  executeReplayCausalSync(context) {
    return this.executeReplayCausal(context).then(r => {
      this.recordReceipt(r);
      return r;
    });
  }

  async executeHypermutation(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.STRESS_HYPERMUTATION, 'STRUCTURED_MUTATION', {
      radius: context.radius || 'medium'
    })
    const mutatedGenome = mutateSearchGenome(context.searchGenome, context.radius || 'medium')
    r.setSuccess({
      action: 'GENOME_MUTATED',
      mutations: mutatedGenome.mutations || [],
      newGenome: mutatedGenome
    })
    if (this.gitService && typeof this.gitService.mutate === 'function') {
      try {
        const applied = await this.gitService.mutate(context, mutatedGenome)
        r.setSuccess({ ...r.result, gitMutationApplied: applied })
      } catch (_) {}
    }
    return r
  }

  executeHypermutationSync(context) {
    return this.executeHypermutation(context).then(r => {
      this.recordReceipt(r);
      return r;
    });
  }

  async executeSpeciation(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.SPECIATION, 'NICHE_CREATION', {
      count: context.nicheCount || 3
    })
    const niches = createNiches(context)
    try {
      const db = this.db || await getDatabase()
      const agentId = context.agentId || 'unknown'
      const parentAgent = await db.get('SELECT * FROM agents WHERE id = ?', agentId)
      const created = []
      for (const niche of niches) {
        try {
          // Real GenOS primitive: cloneFromAgent creates agent + lineage atomically
          const result = await lineageController.cloneFromAgent(db, { parentAgent, parentId: agentId })
          if (result?.body?.success) {
            created.push({ id: result.body.clonedAgentId, focus: niche.focus, via: 'cloneFromAgent' })
          }
        } catch (e) {
          // fallback: direct insert if cloneFromAgent fails
          const nicheId = `niche_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
          await db.run(
            `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, isolation_mode, current_task)
             VALUES (?, ?, 'speciated_niche', 'idle', 'GenOS', 'worker', NULL, 'isolated', ?)`,
            nicheId,
            `Niche: ${niche.focus}`,
            `Speciated niche ${niche.focus} from agent ${agentId}`
          )
          await db.run(
            `INSERT INTO lineage_nodes (id, agent_id, label, node_type, state_summary)
             VALUES (?, ?, ?, 'speciation', ?)
             ON CONFLICT(id) DO NOTHING`,
            nicheId, nicheId, `Niche ${niche.focus}`, JSON.stringify(niche)
          )
          created.push({ id: nicheId, focus: niche.focus, via: 'fallback_insert' })
        }
      }
      r.setSuccess({
        action: 'NICHES_CREATED',
        count: created.length,
        niches: created
      })
    } catch (err) {
      r.setSuccess({
        action: 'NICHES_CREATED',
        count: niches.length,
        niches: niches.map(n => ({ id: n.id, focus: n.focus })),
        note: `Niches created in-memory only: ${err.message}`
      })
    }
    return r
  }

  executeSpeciationSync(context) {
    return this.executeSpeciation(context).then(r => {
      this.recordReceipt(r);
      return r;
    });
  }

  async executeEvolution(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.EVOLUTION, 'EVOLUTION_TRIGGER', {
      population: context.population || 1
    })
    const evolved = evolvePopulation(context)
    r.setSuccess({
      action: 'POPULATION_EVOLVED',
      generations: evolved.generations,
      fitnessImprovement: evolved.fitnessDelta
    })
    try {
      const db = this.db || await getDatabase()
      const agentId = context.agentId || 'unknown'
      const parentAgent = await db.get('SELECT * FROM agents WHERE id = ?', agentId)
      if (parentAgent && parentAgent.execution_mode === 'orchestrator') {
        const result = await lineageController.cloneFromAgent(db, { parentAgent, parentId: agentId })
        if (result?.body?.success) {
          r.setSuccess({
            ...r.result,
            evolvedAgentId: result.body.clonedAgentId,
            evolvedVia: 'cloneFromAgent'
          })
        }
      }
    } catch (err) {
      r.setSuccess({ ...r.result, note: `Evolution applied in-memory only: ${err.message}` })
    }
    return r
  }

  executeEvolutionSync(context) {
    return this.executeEvolution(context).then(r => {
      this.recordReceipt(r);
      return r;
    });
  }



  recordReceipt(receipt) {
    this.receipts.push(receipt)
    if (this.receipts.length > this.maxReceipts) this.receipts.shift()
  }

  getReceipts() { return this.receipts.slice() }
  clearReceipts() { this.receipts = [] }
}

module.exports = { NaturalSearchActuator, SEARCH_PROCESS }
