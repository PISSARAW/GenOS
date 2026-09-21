/**
 * Causal Progress Service — Senseur de progrès causal v2.
 *
 * Corrections P0 :
 *  - P0-5 : searchYield normalisé par budget (plus de mélange tokens+$+s)
 *  - P0-7 : hypothesisInformationGain entre enfin dans le rendement
 *  - P0-12 : prevenance explicite des preuves
 *  - P0-13 : detectDiminishingReturns utilise EWMA + 2 fenêtres
 */

const SEARCH_PROGRESS_WINDOW_MS = 90_000
const DEFAULT_EVIDENCE_WEIGHT = 0.35
const DEFAULT_UNCERTAINTY_WEIGHT = 0.15
const DEFAULT_CONSTRAINT_WEIGHT = 0.1
const DEFAULT_ARTIFACT_WEIGHT = 0.15
const DEFAULT_OBJECTIVE_WEIGHT = 0.1
const DEFAULT_HYPOTHESIS_INFO_WEIGHT = 0.15

const PROVENANCE = {
  OBSERVED: 'observed',
  VERIFIED: 'verified',
  INFERRED: 'inferred',
  SELF_REPORTED: 'self_reported'
}

const PROVENANCE_WEIGHTS = {
  observed: 1.0,
  verified: 1.0,
  inferred: 0.6,
  self_reported: 0.3
}

class SearchProgressWindow {
  constructor(windowMs = SEARCH_PROGRESS_WINDOW_MS) {
    this.windowMs = windowMs
    this.steps = []
    this.objectiveStart = null
    this.emaYield = null
    this.emaAlpha = 0.3
  }

  ensureObjectiveInitial(value) {
    if (this.objectiveStart === null) {
      this.objectiveStart = value
    }
  }

  pushStep(step) {
    const now = Date.now()
    const provenance = step.provenance || PROVENANCE.SELF_REPORTED
    const provenanceWeight = PROVENANCE_WEIGHTS[provenance] ?? 0.3
    this.steps.push({
      ts: now,
      evidenceGain: Number(step.evidenceGain || 0) * provenanceWeight,
      uncertaintyReduction: Number(step.uncertaintyReduction || 0) * provenanceWeight,
      constraintsResolved: Number(step.constraintsResolved || 0),
      verifiedArtifactDelta: Number(step.verifiedArtifactDelta || 0),
      objectiveDelta: Number(step.objectiveDelta || 0),
      hypothesisInformationGain: Number(step.hypothesisInformationGain || 0) * provenanceWeight,
      tokensConsumed: Number(step.tokensConsumed || 0),
      timeConsumed: Number(step.timeConsumed || 0),
      costConsumed: Number(step.costConsumed || 0),
      provenance
    })
    const cutoff = now - this.windowMs
    while (this.steps.length && this.steps[0].ts < cutoff) {
      this.steps.shift()
    }
  }

  resetAfter(ts) {
    this.steps = this.steps.filter(s => s.ts > ts)
  }

  usefulProgress() {
    let evidence = 0, uncertainty = 0, constraints = 0, artifacts = 0, objective = 0, hypothesis = 0
    for (const s of this.steps) {
      evidence += s.evidenceGain
      uncertainty += s.uncertaintyReduction
      constraints += s.constraintsResolved
      artifacts += s.verifiedArtifactDelta
      objective += s.objectiveDelta
      hypothesis += s.hypothesisInformationGain
    }
    return {
      evidenceGain: evidence,
      uncertaintyReduction: uncertainty,
      constraintsResolved: constraints,
      verifiedArtifactDelta: artifacts,
      objectiveDelta: objective,
      hypothesisInformationGain: hypothesis
    }
  }

  resourceConsumption() {
    let tokens = 0, time = 0, cost = 0
    for (const s of this.steps) {
      tokens += s.tokensConsumed
      time += s.timeConsumed
      cost += s.costConsumed
    }
    return { tokensConsumed: tokens, timeConsumed: time, costConsumed: cost }
  }

  stepCount() { return this.steps.length }

  /**
   * Détection de rendements décroissants par EWMA du yield.
   * Compare la moyenne des yields récents à l'EWMA historique.
   * Minimum 4 pas pour éviter les déclenchements prématurés (P1-8).
   */
  detectDiminishingReturns(threshold = 0.5) {
    if (this.steps.length < 4) return false
    const yields = this.steps.map(s => this.stepYield(s))
    const half = Math.floor(yields.length / 2)
    const firstHalf = yields.slice(0, half)
    const secondHalf = yields.slice(half)
    const meanFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const meanSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    if (meanFirst <= 0) return false
    return (meanSecond / meanFirst) < threshold
  }

  stepYield(step) {
    const useful = this.weightedUseful(step)
    const res = Math.max(0.001, step.tokensConsumed + step.timeConsumed * 1000 + step.costConsumed * 100000)
    return useful / Math.max(res, 1)
  }

  weightedUseful(step) {
    return (
      DEFAULT_EVIDENCE_WEIGHT * step.evidenceGain +
      DEFAULT_UNCERTAINTY_WEIGHT * step.uncertaintyReduction +
      DEFAULT_CONSTRAINT_WEIGHT * step.constraintsResolved +
      DEFAULT_ARTIFACT_WEIGHT * step.verifiedArtifactDelta +
      DEFAULT_OBJECTIVE_WEIGHT * step.objectiveDelta +
      DEFAULT_HYPOTHESIS_INFO_WEIGHT * step.hypothesisInformationGain
    )
  }

  weightedUsefulTotal() {
    let total = 0
    for (const s of this.steps) { total += this.weightedUseful(s) }
    return total
  }

  objectiveProgress() {
    if (this.objectiveStart === null) return 0
    let delta = 0
    for (const s of this.steps) { delta += s.objectiveDelta }
    const total = Math.abs(this.objectiveStart) + Math.abs(delta)
    if (total === 0) return 0
    return delta / total
  }
}

class CausalProgressService {
  constructor(options = {}) {
    this.windowMs = options.windowMs || SEARCH_PROGRESS_WINDOW_MS
    this.window = new SearchProgressWindow(this.windowMs)
    this.globalEvidence = 0
    this.globalUncertainty = 0
    this.globalConstraints = 0
    this.globalArtifacts = 0
    this.globalObjective = 0
    this.globalHypothesisInfo = 0
    this.globalTokens = 0
    this.globalTime = 0
    this.globalCost = 0
  }

  ingestEvent(event) {
    if (!event || typeof event !== 'object') return this.report()
    const payload = event.payload || {}
    const provenance = payload.provenance || PROVENANCE.SELF_REPORTED
    const pw = PROVENANCE_WEIGHTS[provenance] ?? 0.3
    const evidence = Number(payload.evidenceGain || 0) * pw
    const uncertainty = Number(payload.uncertaintyReduction || 0) * pw
    const constraints = Number(payload.constraintsResolved || 0)
    const artifacts = Number(payload.verifiedArtifactDelta || 0)
    const objective = Number(payload.objectiveDelta || 0)
    const hypothesis = Number(payload.hypothesisInformationGain || 0) * pw
    const tokens = Number(payload.tokensConsumed || 0)
    const time = Number(payload.timeConsumed || 0)
    const cost = Number(payload.costConsumed || 0)

    this.window.pushStep({
      evidenceGain: evidence, uncertaintyReduction: uncertainty,
      constraintsResolved: constraints, verifiedArtifactDelta: artifacts,
      objectiveDelta: objective, hypothesisInformationGain: hypothesis,
      tokensConsumed: tokens, timeConsumed: time, costConsumed: cost,
      provenance
    })

    this.globalEvidence += evidence
    this.globalUncertainty += uncertainty
    this.globalConstraints += constraints
    this.globalArtifacts += artifacts
    this.globalObjective += objective
    this.globalHypothesisInfo += hypothesis
    this.globalTokens += tokens
    this.globalTime += time
    this.globalCost += cost

    return this.report()
  }

  seedObjective(value) { this.window.ensureObjectiveInitial(value) }

  resetAfterEvent() {
    this.window.steps = []
  }

  report() {
    const win = this.window
    const wUseful = win.usefulProgress()
    const wRes = win.resourceConsumption()
    const wSteps = win.stepCount()
    const wYield = this.searchYield(wUseful, wRes)

    return {
      window: {
        evidenceGain: wUseful.evidenceGain,
        uncertaintyReduction: wUseful.uncertaintyReduction,
        constraintsResolved: wUseful.constraintsResolved,
        verifiedArtifactDelta: wUseful.verifiedArtifactDelta,
        objectiveDelta: wUseful.objectiveDelta,
        hypothesisInformationGain: wUseful.hypothesisInformationGain,
        tokensConsumed: wRes.tokensConsumed,
        timeConsumed: wRes.timeConsumed,
        costConsumed: wRes.costConsumed,
        steps: wSteps,
        searchYield: wYield
      },
      global: {
        evidenceGain: this.globalEvidence, uncertaintyReduction: this.globalUncertainty,
        constraintsResolved: this.globalConstraints, verifiedArtifactDelta: this.globalArtifacts,
        objectiveDelta: this.globalObjective, hypothesisInformationGain: this.globalHypothesisInfo,
        tokensConsumed: this.globalTokens, timeConsumed: this.globalTime,
        costConsumed: this.globalCost
      },
      diagnostics: {
        diminishingReturns: win.detectDiminishingReturns(),
        stepsInWindow: wSteps,
        objectiveProgress: win.objectiveProgress()
      }
    }
  }

  /**
   * searchYield v2 : normalisation par budget (P0-5).
   * Chaque ressource est normalisée indépendamment par son budget,
   * puis combinée avec des poids.
   */
  searchYield(useful, resources, budgets = {}) {
    const tokenBudget = Math.max(1, budgets.tokenBudget || 100000)
    const costBudget = Math.max(0.01, budgets.costBudget || 1.0)
    const timeBudget = Math.max(1, budgets.timeBudget || 600)

    const totalUseful = (
      DEFAULT_EVIDENCE_WEIGHT * useful.evidenceGain +
      DEFAULT_UNCERTAINTY_WEIGHT * useful.uncertaintyReduction +
      DEFAULT_CONSTRAINT_WEIGHT * useful.constraintsResolved +
      DEFAULT_ARTIFACT_WEIGHT * useful.verifiedArtifactDelta +
      DEFAULT_OBJECTIVE_WEIGHT * useful.objectiveDelta +
      DEFAULT_HYPOTHESIS_INFO_WEIGHT * useful.hypothesisInformationGain
    )

    const normalizedCost = (
      0.5 * (resources.tokensConsumed / tokenBudget) +
      0.3 * (resources.costConsumed / costBudget) +
      0.2 * (resources.timeConsumed / timeBudget)
    )

    if (normalizedCost <= 0) return 0
    const eps = 0.001
    return totalUseful / (eps + normalizedCost)
  }
}

module.exports = {
  SearchProgressWindow, CausalProgressService,
  DEFAULT_EVIDENCE_WEIGHT, DEFAULT_UNCERTAINTY_WEIGHT,
  DEFAULT_CONSTRAINT_WEIGHT, DEFAULT_ARTIFACT_WEIGHT,
  DEFAULT_OBJECTIVE_WEIGHT, DEFAULT_HYPOTHESIS_INFO_WEIGHT,
  PROVENANCE, PROVENANCE_WEIGHTS
}
