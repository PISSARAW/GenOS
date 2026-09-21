const { SearchReceipt } = require('./SearchReceipt')

const SEARCH_PROCESS = {
  CONTINUE: 'CONTINUE',
  FORAGE: 'FORAGE',
  PLASTICITE: 'PLASTICITE',
  CLONAL_AFFINITY_SEARCH: 'CLONAL_AFFINITY_SEARCH',
  REPLAY_CAUSAL: 'REPLAY_CAUSAL',
  STRESS_HYPERMUTATION: 'STRESS_HYPERMUTATION',
  SPECIATION: 'SPECIATION'
}

class NaturalSearchActuator {
  constructor(options = {}) {
    this.foragingService = options.foragingService || null
    this.gitService = options.gitService || null
    this.receipts = []
    this.maxReceipts = 50
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
      default: {
        const r = new SearchReceipt(process, 'UNKNOWN')
        r.setFailure(`Unknown process: ${process}`)
        this.recordReceipt(r)
        return r
      }
    }
  }

  async executeContinue(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.CONTINUE, 'NO_OP')
    r.setSuccess({ adjusted: false })
    return r
  }

  executeContinueSync(context) {
    const r = this.executeContinueSyncImpl(context)
    this.recordReceipt(r)
    return r
  }

  executeContinueSyncImpl(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.CONTINUE, 'NO_OP')
    r.setSuccess({ adjusted: false })
    return r
  }

  async executeForage(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.FORAGE, 'PATCH_DEPARTURE', { patch: context.currentPatch })
    r.setSuccess({ action: 'RECOMMEND_PATCH_DEPARTURE', reason: 'marginal yield below threshold', nextStep: 'agent should switch search region' })
    return r
  }

  executeForageSync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.FORAGE, 'PATCH_DEPARTURE', { patch: context.currentPatch })
    r.setSuccess({ action: 'RECOMMEND_PATCH_DEPARTURE', reason: 'marginal yield below threshold', nextStep: 'agent should switch search region' })
    this.recordReceipt(r)
    return r
  }

  async executePlasticity(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.PLASTICITE, 'PHENOTYPE_ADAPTATION', { topology: context.topology, tools: context.tools })
    const newPhenotype = this.generatePhenotypeVariant(context)
    r.setSuccess({ action: 'PHENOTYPE_CHANGED', before: { topology: context.topology, tools: context.tools }, after: newPhenotype })
    return r
  }

  executePlasticitySync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.PLASTICITE, 'PHENOTYPE_ADAPTATION', { topology: context.topology, tools: context.tools })
    const newPhenotype = this.generatePhenotypeVariant(context)
    r.setSuccess({ action: 'PHENOTYPE_CHANGED', before: { topology: context.topology, tools: context.tools }, after: newPhenotype })
    this.recordReceipt(r)
    return r
  }

  async executeClonalAffinity(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH, 'CLONE_AND_VARY', { baseHypothesis: context.baseHypothesis })
    const variants = this.createHypothesisVariants(context)
    r.setSuccess({ action: 'VARIANTS_CREATED', count: variants.length, variants: variants.map(v => v.statement) })
    return r
  }

  executeClonalAffinitySync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH, 'CLONE_AND_VARY', { baseHypothesis: context.baseHypothesis })
    const variants = this.createHypothesisVariants(context)
    r.setSuccess({ action: 'VARIANTS_CREATED', count: variants.length, variants: variants.map(v => v.statement) })
    this.recordReceipt(r)
    return r
  }

  async executeReplayCausal(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.REPLAY_CAUSAL, 'SNAPSHOT_RESTORE_AND_REPLAY', { restorePoint: context.lastKnownGood })
    r.setSuccess({ action: 'REPLAY_INITIATED', restorePoint: context.lastKnownGood || 'last_checkpoint', newHypothesisSpawned: context.lockInHypothesis ? true : false })
    return r
  }

  executeReplayCausalSync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.REPLAY_CAUSAL, 'SNAPSHOT_RESTORE_AND_REPLAY', { restorePoint: context.lastKnownGood })
    r.setSuccess({ action: 'REPLAY_INITIATED', restorePoint: context.lastKnownGood || 'last_checkpoint', newHypothesisSpawned: context.lockInHypothesis ? true : false })
    this.recordReceipt(r)
    return r
  }

  async executeHypermutation(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.STRESS_HYPERMUTATION, 'STRUCTURED_MUTATION', { radius: context.radius || 'medium' })
    const mutatedGenome = this.mutateSearchGenome(context.searchGenome, context.radius || 'medium')
    r.setSuccess({ action: 'GENOME_MUTATED', mutations: mutatedGenome.mutations || [], newGenome: mutatedGenome })
    return r
  }

  executeHypermutationSync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.STRESS_HYPERMUTATION, 'STRUCTURED_MUTATION', { radius: context.radius || 'medium' })
    const mutatedGenome = this.mutateSearchGenome(context.searchGenome, context.radius || 'medium')
    r.setSuccess({ action: 'GENOME_MUTATED', mutations: mutatedGenome.mutations || [], newGenome: mutatedGenome })
    this.recordReceipt(r)
    return r
  }

  async executeSpeciation(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.SPECIATION, 'NICHE_CREATION', { count: context.nicheCount || 3 })
    const niches = this.createNiches(context)
    r.setSuccess({ action: 'NICHES_CREATED', count: niches.length, niches: niches.map(n => ({ id: n.id, focus: n.focus })) })
    return r
  }

  executeSpeciationSync(context) {
    const r = new SearchReceipt(SEARCH_PROCESS.SPECIATION, 'NICHE_CREATION', { count: context.nicheCount || 3 })
    const niches = this.createNiches(context)
    r.setSuccess({ action: 'NICHES_CREATED', count: niches.length, niches: niches.map(n => ({ id: n.id, focus: n.focus })) })
    this.recordReceipt(r)
    return r
  }

  generatePhenotypeVariant(context) {
    const topologies = ['isolated', 'adversarial', 'swarm', 'pipeline']
    const toolSets = [['grep', 'test', 'trace'], ['profiler', 'causal-replay', 'fuzz'], ['formal-verify', 'model-check']]
    const currentTopology = context.topology || 'isolated'
    const newTopology = topologies.find(t => t !== currentTopology) || topologies[0]
    const newTools = toolSets[Math.floor(Math.random() * toolSets.length)]
    return { topology: newTopology, tools: newTools, strategy: context.strategy || 'direct-debug' }
  }

  createHypothesisVariants(context) {
    const base = context.baseHypothesis || 'Hypothèse de base'
    return [0, 1, 2, 3].map(i => ({ id: `v${i}`, statement: `${base} (variant ${i})`, mutation: `mut${i}` }))
  }

  mutateSearchGenome(genome, radius) {
    const radiusMap = { minimal: 1, local: 2, medium: 3, structural: 4, radical: 5 }
    const numMutations = radiusMap[radius] || 3
    const targets = ['hypothesis', 'strategy', 'tool', 'decomposition', 'topology', 'representation']
    const mutations = []
    for (let i = 0; i < numMutations; i++) {
      mutations.push({ target: targets[Math.floor(Math.random() * targets.length)], action: 'mutated' })
    }
    return { originalGenome: genome, mutations, newGenome: { ...genome, mutated: true, mutations } }
  }

  createNiches(context) {
    const count = context.nicheCount || 3
    const focuses = ['temporal', 'state', 'environment', 'causal', 'behavioral']
    return Array.from({ length: count }, (_, i) => ({
      id: `niche_${i}`, focus: focuses[i % focuses.length], budget: 'shared', operators: [], memory: { negative_trails: true }
    }))
  }

  recordReceipt(receipt) {
    this.receipts.push(receipt)
    if (this.receipts.length > this.maxReceipts) this.receipts.shift()
  }

  getReceipts() { return this.receipts.slice() }
  clearReceipts() { this.receipts = [] }
}

module.exports = { NaturalSearchActuator, SEARCH_PROCESS }
