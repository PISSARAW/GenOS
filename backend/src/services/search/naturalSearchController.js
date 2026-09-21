/**
 * Natural Search Controller — Contrôleur de recherche naturelle.
 *
 * Phase 5 : assemble les mécanismes précédents.
 * Sélectionne un processus de recherche, pas une stratégie de résolution.
 *
 * Pseudo-logique :
 *  - pression faible → CONTINUE
 *  - rendement marginal faible → FORAGE (changer de patch)
 *  - pression modérée → PLASTICITE (adapter le phénotype)
 *  - hypothèse prometteuse → CLONAL_AFFINITY_SEARCH
 *  - hypothèse falsifiée → REPLAY_CAUSAL
 *  - pression forte → STRESS_HYPERMUTATION
 *  - échecs multiples → SPECIATION
 *  - stagnation lignée → EVOLUTION
 */

const { SearchPressureModel, ESCALATION_RADII } = require('./searchPressureService')
const { classifySearchState, SEARCH_STATE } = require('./entropyProgressClassifier')
const { CausalProgressService } = require('./causalProgressService')

const SEARCH_PROCESS = {
  CONTINUE: 'CONTINUE',
  FORAGE: 'FORAGE',
  PLASTICITE: 'PLASTICITE',
  CLONAL_AFFINITY_SEARCH: 'CLONAL_AFFINITY_SEARCH',
  REPLAY_CAUSAL: 'REPLAY_CAUSAL',
  STRESS_HYPERMUTATION: 'STRESS_HYPERMUTATION',
  SPECIATION: 'SPECIATION',
  EVOLUTION: 'EVOLUTION'
}

const PHASE_THRESHOLDS = {
  HOMEOSTASIS_MAX: 0.2,
  CHEMOTAXIS_MAX: 0.4,
  PLASTICITY_MAX: 0.6,
  CLONAL_MAX: 0.75,
  HYPERMUTATION_MAX: 0.9
}

class NaturalSearchController {
  constructor(options = {}) {
    this.pressureModel = new SearchPressureModel(options.pressure)
    this.history = []
    this.lastProcess = null
    this.stepsSinceChange = 0
  }

  /**
   * Déterminer le prochain processus de recherche.
   * @param {Object} ctx
   * @param {string} ctx.agentId
   * @param {number} ctx.searchYield
   * @param {number} ctx.stepsSinceProgress
   * @param {number} ctx.falsifiedHypotheses
   * @param {number} ctx.contradictions
   * @param {number} ctx.activeHypothesesCount
   * @param {number} ctx.budgetRatio
   * @param {Object} ctx.causalProgressReport
   * @returns {{process, pressure, classification, diagnostics}}
   */
  selectProcess(ctx) {
    const pressure = this.pressureModel.update({
      searchYield: ctx.searchYield,
      stepsSinceProgress: ctx.stepsSinceProgress,
      falsifiedHypotheses: ctx.falsifiedHypotheses,
      contradictions: ctx.contradictions,
      activeHypothesesCount: ctx.activeHypothesesCount,
      budgetRatio: ctx.budgetRatio
    })

    const classification = classifySearchState(
      ctx.agentId,
      ctx.causalProgressReport,
      ctx.entropyMetrics
    )

    let process
    let diagnostics = {}

    // Règles de sélection
    if (pressure.pressure < PHASE_THRESHOLDS.HOMEOSTASIS_MAX) {
      process = SEARCH_PROCESS.CONTINUE
      diagnostics = { reason: 'low pressure, continue current search' }
    }
    else if (pressure.pressure < PHASE_THRESHOLDS.CHEMOTAXIS_MAX) {
      if (ctx.searchYield !== undefined && ctx.searchYield < 0.05) {
        process = SEARCH_PROCESS.FORAGE
        diagnostics = { reason: 'low marginal yield — leave patch' }
      } else {
        process = SEARCH_PROCESS.CONTINUE
        diagnostics = { reason: 'manageable pressure, persist' }
      }
    }
    else if (pressure.pressure < PHASE_THRESHOLDS.PLASTICITY_MAX) {
      process = SEARCH_PROCESS.PLASTICITE
      diagnostics = { reason: 'moderate pressure — adapt phenotype' }
    }
    else if (pressure.pressure < PHASE_THRESHOLDS.CLONAL_MAX) {
      if (classification.state === SEARCH_STATE.HYPOTHESIS_LOCK_IN) {
        process = SEARCH_PROCESS.REPLAY_CAUSAL
        diagnostics = { reason: 'hypothesis lock-in — causal replay' }
      } else if (ctx.falsifiedHypotheses > 0) {
        process = SEARCH_PROCESS.REPLAY_CAUSAL
        diagnostics = { reason: 'falsified hypothesis — revert to last known good' }
      } else {
        process = SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH
        diagnostics = { reason: 'promising zone — affinity search' }
      }
    }
    else if (pressure.pressure < PHASE_THRESHOLDS.HYPERMUTATION_MAX) {
      process = SEARCH_PROCESS.STRESS_HYPERMUTATION
      diagnostics = { reason: 'high pressure — controlled hypermutation' }
    }
    else {
      // Pression très forte : plusieurs échecs indépendants
      if (ctx.falsifiedHypotheses >= 3) {
        process = SEARCH_PROCESS.SPECIATION
        diagnostics = { reason: 'multiple independent failures — speciation' }
      } else {
        process = SEARCH_PROCESS.STRESS_HYPERMUTATION
        diagnostics = { reason: 'very high pressure — radical hypermutation' }
      }
    }

    this.lastProcess = process
    this.stepsSinceChange = 0

    return {
      process,
      pressure: pressure.pressure,
      recommendedRadius: pressure.recommendedRadius,
      classification: classification.state,
      diagnostics,
      causes: pressure.causes
    }
  }

  /**
   * Historiser une sélection pour analyse.
   */
  recordSelection(selection) {
    this.history.push({
      ts: Date.now(),
      ...selection
    })
    if (this.history.length > 100) this.history.shift()
  }

  /**
   * Obtenir l'historique des sélections.
   */
  getHistory() {
    return this.history.slice()
  }
}

module.exports = {
  NaturalSearchController,
  SEARCH_PROCESS,
  PHASE_THRESHOLDS
}
