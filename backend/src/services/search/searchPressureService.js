/**
 * Search Pressure Service — Pression de recherche.
 *
 * Phase 4 : Modélise à quel point l'environnement indique
 * que la méthode de recherche actuelle doit changer.
 *
 * P_search(t) ∈ [0,1]
 *
 * Augmente avec :
 *  - stagnation (pas de progrès causal)
 *  - incertitude persistante
 *  - hypothèses falsifiées
 *  - contradictions
 *  - rendements décroissants
 *  - répétitions
 *  - échecs
 *
 * Diminue avec :
 *  - nouvelles preuves
 *  - réduction d'incertitude
 *  - contraintes résolues
 *  - progression vers l'objectif
 */

const SEARCH_PRESSURE_CAUSES = {
  LOW_INFORMATION_GAIN: 'low_information_gain',
  PERSISTENT_UNCERTAINTY: 'persistent_uncertainty',
  ACTIVE_HYPOTHESIS_WEAKENED: 'active_hypothesis_weakened',
  THREE_LOW_YIELD_STEPS: 'three_low_yield_steps',
  HYPOTHESIS_FALSIFIED: 'hypothesis_falsified',
  CONTRADICTION: 'contradiction',
  BUDGET_PRESSURE: 'budget_pressure'
}

const ESCALATION_RADII = {
  MINIMAL: 'minimal',
  LOCAL: 'local',
  MEDIUM: 'medium',
  STRUCTURAL: 'structural',
  RADICAL: 'radical'
}

class SearchPressureModel {
  constructor(options = {}) {
    this.pressure = 0
    this.causes = []
    this.confidence = 0
    this.recommendedRadius = ESCALATION_RADII.LOCAL

    // Configuration des seuils
    this.lowYieldThreshold = options.lowYieldThreshold || 0.05
    this.stagnationWindow = options.stagnationWindow || 3
    this.pressureDecayRate = options.pressureDecayRate || 0.1
    this.pressureIncreaseRate = options.pressureIncreaseRate || 0.2
    this.maxPressure = options.maxPressure || 1.0
    this.minPressure = options.minPressure || 0.0
  }

  /**
   * Mettre à jour la pression en fonction de l'état actuel.
   * @param {Object} inputs
   * @param {number} inputs.searchYield — rendement actuel
   * @param {number} inputs.stepsSinceProgress — pas depuis dernier progrès
   * @param {number} inputs.falsifiedHypotheses — nombre d'hypothèses falsifiées
   * @param {number} inputs.contradictions — nombre de contradictions détectées
   * @param {number} inputs.activeHypothesesCount — nombre d'hypothèses actives
   * @param {number} inputs.budgetRatio — ratio de budget consommé (0–1)
   * @returns {{pressure, confidence, causes, recommendedRadius}}
   */
  update(inputs) {
    const causes = []
    let deltaPressure = 0

    // 1. Rendement faible
    if (inputs.searchYield !== undefined && inputs.searchYield < this.lowYieldThreshold) {
      deltaPressure += this.pressureIncreaseRate
      causes.push(SEARCH_PRESSURE_CAUSES.LOW_INFORMATION_GAIN)
    }

    // 2. Stagnation
    if (inputs.stepsSinceProgress !== undefined && inputs.stepsSinceProgress >= this.stagnationWindow) {
      deltaPressure += this.pressureIncreaseRate * (inputs.stepsSinceProgress / this.stagnationWindow)
      causes.push(SEARCH_PRESSURE_CAUSES.THREE_LOW_YIELD_STEPS)
    }

    // 3. Hypothèses falsifiées
    if (inputs.falsifiedHypotheses !== undefined && inputs.falsifiedHypotheses > 0) {
      deltaPressure += this.pressureIncreaseRate * inputs.falsifiedHypotheses
      causes.push(SEARCH_PRESSURE_CAUSES.HYPOTHESIS_FALSIFIED)
    }

    // 4. Contradictions
    if (inputs.contradictions !== undefined && inputs.contradictions > 0) {
      deltaPressure += this.pressureIncreaseRate * inputs.contradictions * 1.5
      causes.push(SEARCH_PRESSURE_CAUSES.CONTRADICTION)
    }

    // 5. Incertitude persistante
    if (inputs.persistentUncertainty !== undefined && inputs.persistentUncertainty > 0.5) {
      deltaPressure += this.pressureIncreaseRate
      causes.push(SEARCH_PRESSURE_CAUSES.PERSISTENT_UNCERTAINTY)
    }

    // 6. Pression budgétaire
    if (inputs.budgetRatio !== undefined && inputs.budgetRatio > 0.8) {
      deltaPressure += this.pressureIncreaseRate
      causes.push(SEARCH_PRESSURE_CAUSES.BUDGET_PRESSURE)
    }

    // Réduction si signes positifs
    if (inputs.searchYield !== undefined && inputs.searchYield > this.lowYieldThreshold * 2) {
      deltaPressure -= this.pressureDecayRate
    }
    if (inputs.uncertaintyReduction !== undefined && inputs.uncertaintyReduction > 0.1) {
      deltaPressure -= this.pressureDecayRate * inputs.uncertaintyReduction
    }

    // Clamp
    this.pressure = Math.max(this.minPressure, Math.min(this.maxPressure, this.pressure + deltaPressure))

    // Confiance : proportionnelle au nombre de causes
    this.confidence = Math.min(1, causes.length * 0.3)

    this.causes = causes
    this.recommendedRadius = this.escalationRadius()

    return this.report()
  }

  /**
   * Déterminer le rayon d'escalade en fonction de la pression.
   */
  escalationRadius() {
    if (this.pressure < 0.2) return ESCALATION_RADII.MINIMAL
    if (this.pressure < 0.4) return ESCALATION_RADII.LOCAL
    if (this.pressure < 0.6) return ESCALATION_RADII.MEDIUM
    if (this.pressure < 0.8) return ESCALATION_RADII.STRUCTURAL
    return ESCALATION_RADII.RADICAL
  }

  /**
   * Obtention du rapport de pression.
   */
  report() {
    return {
      pressure: Number(this.pressure.toFixed(3)),
      confidence: Number(this.confidence.toFixed(3)),
      causes: this.causes,
      recommendedRadius: this.recommendedRadius
    }
  }

  /**
   * Réinitialiser la pression (après changement de stratégie).
   */
  reset() {
    this.pressure = 0
    this.causes = []
    this.confidence = 0
    this.recommendedRadius = ESCALATION_RADII.LOCAL
  }
}

module.exports = {
  SearchPressureModel,
  SEARCH_PRESSURE_CAUSES,
  ESCALATION_RADII
}
