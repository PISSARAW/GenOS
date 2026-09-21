const crypto = require('crypto')

/**
 * SearchGenome — Représentation explicite du génotype de recherche.
 *
 * Phase 6 : L'hypermutation structurée opère sur ce génome,
 * pas sur des mots du prompt.
 */

const HYPOTHESIS_FAMILIES = ['cache', 'race-condition', 'state-drift', 'timing', 'config', 'decomposition']
const STRATEGIES = ['causal-debugging', 'falsification', 'state-differential', 'temporal-bisection', 'model-checking']
const OPERATORS = ['grep', 'test', 'trace', 'profiler', 'causal-replay', 'fuzz', 'formal-verify']
const TOPOLOGIES = ['isolated', 'adversarial', 'swarm', 'pipeline']
const EVIDENCE_POLICIES = ['require-counterexample', 'multi-agent-verify', 'independent-repro', 'artifact-hash']

function createRandomGenome(overrides = {}) {
  return {
    id: overrides.id || crypto.randomBytes(6).toString('hex'),
    hypothesisFamily: overrides.hypothesisFamily || pickRandom(HYPOTHESIS_FAMILIES),
    strategy: overrides.strategy || pickRandom(STRATEGIES),
    operators: overrides.operators || pickN(OPERATORS, 2),
    topology: overrides.topology || pickRandom(TOPOLOGIES),
    evidencePolicy: overrides.evidencePolicy || pickRandom(EVIDENCE_POLICIES),
    exploration: overrides.exploration || { radius: 0.18, noveltyWeight: 0.12 },
    memory: overrides.memory || { negativeTrails: true },
    createdAt: Date.now(),
    mutations: []
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

/**
 * Mutation structurée selon le rayon de pression.
 * Les mutations sont enregistrées pour reproductibilité.
 */
function mutateGenome(genome, radius = 'medium') {
  const mutations = []
  const mutated = { ...genome, exploration: { ...genome.exploration }, operators: [...genome.operators], mutations: [...(genome.mutations || [])] }

  const radiusMap = { minimal: 1, local: 2, medium: 3, structural: 4, radical: 6 }
  const numMutations = radiusMap[radius] || 3

  for (let i = 0; i < numMutations; i++) {
    const target = pickRandom(['hypothesisFamily', 'strategy', 'operators', 'topology', 'evidencePolicy', 'exploration'])
    let oldVal, newVal

    switch (target) {
      case 'hypothesisFamily':
        oldVal = mutated.hypothesisFamily
        newVal = pickRandom(HYPOTHESIS_FAMILIES.filter(f => f !== oldVal))
        mutated.hypothesisFamily = newVal
        break;
      case 'strategy':
        oldVal = mutated.strategy
        newVal = pickRandom(STRATEGIES.filter(s => s !== oldVal))
        mutated.strategy = newVal
        break;
      case 'operators':
        oldVal = mutated.operators.join(',')
        mutated.operators = pickN(OPERATORS, 2 + Math.floor(Math.random() * 2))
        newVal = mutated.operators.join(',')
        break;
      case 'topology':
        oldVal = mutated.topology
        newVal = pickRandom(TOPOLOGIES.filter(t => t !== oldVal))
        mutated.topology = newVal
        break;
      case 'evidencePolicy':
        oldVal = mutated.evidencePolicy
        newVal = pickRandom(EVIDENCE_POLICIES.filter(p => p !== oldVal))
        mutated.evidencePolicy = newVal
        break;
      case 'exploration':
        oldVal = `radius=${mutated.exploration.radius}`
        mutated.exploration.radius = Math.min(1, mutated.exploration.radius + (Math.random() - 0.5) * 0.4)
        newVal = `radius=${mutated.exploration.radius.toFixed(3)}`
        break;
    }

    mutations.push({ target, oldVal, newVal })
  }

  mutated.mutations.push({
    ts: Date.now(),
    radius,
    changes: mutations
  })

  return mutated
}

/**
 * Combinaison de deux génomes (évolution/reproduction).
 */
function crossoverGenome(genomeA, genomeB) {
  return {
    ...genomeA,
    strategy: Math.random() < 0.5 ? genomeA.strategy : genomeB.strategy,
    operators: [...new Set([...genomeA.operators, ...genomeB.operators])].slice(0, 3),
    evidencePolicy: Math.random() < 0.5 ? genomeA.evidencePolicy : genomeB.evidencePolicy,
    exploration: {
      radius: (genomeA.exploration.radius + genomeB.exploration.radius) / 2,
      noveltyWeight: Math.max(genomeA.exploration.noveltyWeight, genomeB.exploration.noveltyWeight)
    }
  }
}

module.exports = { createRandomGenome, mutateGenome, crossoverGenome, HYPOTHESIS_FAMILIES, STRATEGIES, OPERATORS, TOPOLOGIES, EVIDENCE_POLICIES }
