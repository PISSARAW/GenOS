/**
 * Search Pressure Service v3 — refonte pour corriger l'accumulation (P1).
 *
 * Au lieu d'accumuler des deltaP à chaque événement (ce qui fait qu'une même
 * falsification remplit la pression indéfiniment), on recalcule la pression
 * à partir de l'état courant avec inertie.
 *
 * P_t = λ P_{t-1} + (1-λ) P^{observed}_t
 */

const SEARCH_PRESSURE_CAUSES = {
  LOW_INFORMATION_GAIN: 'low_information_gain',
  PERSISTENT_UNCERTAINTY: 'persistent_uncertainty',
  HYPOTHESIS_FALSIFIED: 'hypothesis_falsified',
  THREE_LOW_YIELD_STEPS: 'three_low_yield_steps',
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
    this.lowYieldThreshold = options.lowYieldThreshold || 0.05
    this.stagnationWindow = options.stagnationWindow || 3
    this.inertia = options.inertia ?? 0.5
    this.maxPressure = options.maxPressure || 1.0
    this.minPressure = options.minPressure || 0.0
  }

  /**
   * Recalculer la pression à partir de l'état courant.
   * Observed pressure = combinaison des facteurs, chacun dans [0,1].
   */
  update(inputs) {
    const causes = []
    let pObserved = 0

    // 1. Rendement faible
    if (inputs.searchYield !== undefined && inputs.searchYield < this.lowYieldThreshold) {
      pObserved += 0.3
      causes.push(SEARCH_PRESSURE_CAUSES.LOW_INFORMATION_GAIN)
    }

    // 2. Stagnation (proportionnelle au nombre de pas sans progrès)
    if (inputs.stepsSinceProgress !== undefined && inputs.stepsSinceProgress >= this.stagnationWindow) {
      const stagnationFactor = Math.min(1, inputs.stepsSinceProgress / (this.stagnationWindow * 3))
      pObserved += 0.3 * stagnationFactor
      causes.push(SEARCH_PRESSURE_CAUSES.THREE_LOW_YIELD_STEPS)
    }

    // 3. Hypothèses falsifiées (chaque nouvelle falsification compte)
    if (inputs.falsifiedHypotheses !== undefined && inputs.falsifiedHypotheses > 0) {
      const falsificationFactor = Math.min(1, inputs.falsifiedHypotheses / 3)
      pObserved += 0.4 * falsificationFactor
      causes.push(SEARCH_PRESSURE_CAUSES.HYPOTHESIS_FALSIFIED)
    }

    // 4. Contradictions
    if (inputs.contradictions !== undefined && inputs.contradictions > 0) {
      pObserved += 0.2 * Math.min(1, inputs.contradictions / 2)
      causes.push(SEARCH_PRESSURE_CAUSES.CONTRADICTION)
    }

    // 5. Budget
    if (inputs.budgetRatio !== undefined && inputs.budgetRatio > 0.8) {
      pObserved += 0.2 * Math.min(1, (inputs.budgetRatio - 0.8) / 0.2)
      causes.push(SEARCH_PRESSURE_CAUSES.BUDGET_PRESSURE)
    }

    // Réduction si signes positifs
    if (inputs.searchYield !== undefined && inputs.searchYield > this.lowYieldThreshold * 3) {
      pObserved = Math.max(0, pObserved - 0.2)
    }

    // Inertie : P_t = λ P_{t-1} + (1-λ) P_observed
    this.pressure = Math.max(this.minPressure, Math.min(this.maxPressure,
      this.inertia * this.pressure + (1 - this.inertia) * pObserved
    ))

    this.confidence = Math.min(1, causes.length * 0.3)
    this.causes = causes
    this.recommendedRadius = this.escalationRadius()

    return this.report()
  }

  escalationRadius() {
    if (this.pressure < 0.2) return ESCALATION_RADII.MINIMAL
    if (this.pressure < 0.4) return ESCALATION_RADII.LOCAL
    if (this.pressure < 0.6) return ESCALATION_RADII.MEDIUM
    if (this.pressure < 0.8) return ESCALATION_RADII.STRUCTURAL
    return ESCALATION_RADII.RADICAL
  }

  report() {
    return {
      pressure: Number(this.pressure.toFixed(3)),
      confidence: Number(this.confidence.toFixed(3)),
      causes: this.causes,
      recommendedRadius: this.recommendedRadius
    }
  }

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
