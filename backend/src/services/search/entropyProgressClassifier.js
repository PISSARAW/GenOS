/**
 * Recherche progressive du progrès causal (Phase 2 — carte Entropie × Progression).
 *
 * Étend Swarm Sentinel pour classifier les trajectoires d'agent selon deux axes :
 *  - entropie comportementale (variation)
 *  - progrès causal (preuves, réduction d'incertitude, avancée objectif)
 *
 * Résultat : cinq états invariants.
 */

const path = require('node:path')
const swarmSentinel = require(path.resolve(__dirname, '..', 'swarmSentinelService'))
const { CausalProgressService } = require('./causalProgressService')

// États invariants produits par la carte entropie × progression
const SEARCH_STATE = {
  PRODUCTIVE_EXPLOITATION: 'PRODUCTIVE_EXPLOITATION',
  PRODUCTIVE_EXPLORATION: 'PRODUCTIVE_EXPLORATION',
  MECHANICAL_STAGNATION: 'MECHANICAL_STAGNATION',
  PANIC_EXPLORATION: 'PANIC_EXPLORATION',
  HYPOTHESIS_LOCK_IN: 'HYPOTHESIS_LOCK_IN'
}

// Seuils simples (à calibrer expérimentalement)
const ENTROPY_LOW_THRESHOLD = 0.4
const ENTROPY_HIGH_THRESHOLD = 0.7
const PROGRESS_LOW_THRESHOLD = 0.1
const PROGRESS_MEDIUM_THRESHOLD = 0.3

/**
 * Combiner entropy (Swarm Sentinel) et causal progress (CausalProgressService)
 * pour produire un état de recherche invariant.
 *
 * entropyMetrics peut être fourni directement (tests) ou déduit de l'agentId.
 * rétourne :
 *  - state : SEARCH_STATE.*
 *  - diagnostics : explications lisible
 */
function classifySearchState(agentId, causalReport, entropyMetrics) {
  if (!agentId || !causalReport) {
    return {
      state: SEARCH_STATE.MECHANICAL_STAGNATION,
      diagnostics: 'cannot classify, missing inputs'
    }
  }

  const metrics = entropyMetrics !== undefined
    ? entropyMetrics
    : swarmSentinel.getAgentEntropy(agentId)
  const normalizedEntropy = Number(metrics.normalizedEntropy || 0)
  const steps = causalReport.window.steps
  const progress = causalReport.window.searchYield || 0

  const region = resolveRegion(normalizedEntropy, progress)
  const state = STATE_BY_REGION[region]
  const diagnostics = DIAGNOSTICS_BY_REGION[region]

  return { state, diagnostics, normalizedEntropy, steps, searchYield: progress }
}

const STATE_BY_REGION = {
  low_entropy_high_progress: SEARCH_STATE.PRODUCTIVE_EXPLOITATION,
  high_entropy_high_progress: SEARCH_STATE.PRODUCTIVE_EXPLORATION,
  low_entropy_low_progress: SEARCH_STATE.MECHANICAL_STAGNATION,
  high_entropy_low_progress: SEARCH_STATE.PANIC_EXPLORATION,
  medium_entropy_low_progress: SEARCH_STATE.HYPOTHESIS_LOCK_IN,
  inconclusive: SEARCH_STATE.MECHANICAL_STAGNATION
}

const DIAGNOSTICS_BY_REGION = {
  low_entropy_high_progress: {
    region: 'low_entropy_high_progress',
    interpretation: 'stable, productive behavior — continue'
  },
  high_entropy_high_progress: {
    region: 'high_entropy_high_progress',
    interpretation: 'variability producing progress — productive exploration'
  },
  low_entropy_low_progress: {
    region: 'low_entropy_low_progress',
    interpretation: 'frozen or repetitive pattern with no evidence gain',
    cause: 'likely mechanical stagnation or loop'
  },
  high_entropy_low_progress: {
    region: 'high_entropy_low_progress',
    interpretation: 'high variability without progress — panic exploration',
    cause: 'erratic tool hopping without evidence gain'
  },
  medium_entropy_low_progress: {
    region: 'medium_entropy_low_progress',
    interpretation: 'varied actions but hypothesis not moving — lock-in',
    cause: 'same hypothesis, new actions, no evidence gain'
  },
  inconclusive: {
    region: 'inconclusive',
    interpretation: 'insufficient signal to classify definitively',
    notes: 'progress and entropy both moderate'
  }
}

function resolveRegion(normalizedEntropy, progressLevel) {
  const e = normalizedEntropy < ENTROPY_LOW_THRESHOLD ? 'low' : (normalizedEntropy >= ENTROPY_HIGH_THRESHOLD ? 'high' : 'medium')
  const p = progressLevel > PROGRESS_MEDIUM_THRESHOLD ? 'high' : (progressLevel <= PROGRESS_LOW_THRESHOLD ? 'low' : 'med')
  return ENTROPY_PROGRESS_REGION[`${e}:${p}`] || 'inconclusive'
}

const ENTROPY_PROGRESS_REGION = {
  'low:high': 'low_entropy_high_progress',
  'high:high': 'high_entropy_high_progress',
  'low:low': 'low_entropy_low_progress',
  'high:low': 'high_entropy_low_progress',
  'medium:low': 'medium_entropy_low_progress'
}

/**
 * Produit un rapport de recherche complet pour un agent.
 */
function produceSearchReport(agentId, causalProgressService) {
  const causalReport = causalProgressService.report()
  const classification = classifySearchState(agentId, causalReport)

  return {
    agentId,
    searchState: classification.state,
    diagnostics: classification.diagnostics,
    metrics: {
      normalizedEntropy: classification.normalizedEntropy,
      stepsInWindow: classification.steps,
      searchYield: classification.searchYield
    },
    causalProgress: causalReport
  }
}

module.exports = {
  SEARCH_STATE,
  classifySearchState,
  produceSearchReport,
  ENTROPY_LOW_THRESHOLD,
  ENTROPY_HIGH_THRESHOLD,
  PROGRESS_LOW_THRESHOLD,
  PROGRESS_MEDIUM_THRESHOLD
}
