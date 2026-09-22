/**
 * Causal Progress Service v3 — Senseur de progrès causal.
 *
 * Correction P0 : provenance appliquée une seule fois dans ingestEvent(),
 * pushStep() stocke les valeurs déjà pondérées. Globaux et fenêtre cohérents.
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

/**
 * Normalise la consommation de ressources par rapport aux budgets de mission.
 * Utilisé par searchYield(), stepYield() et detectDiminishingReturns().
 */
const normalizedResourcePressure = (resources, budgets) => {
  const tb = Math.max(1, budgets.tokenBudget)
  const cb = Math.max(0.01, budgets.costBudget)
  const tmb = Math.max(1, budgets.timeBudget)
  return (
    0.5 * (resources.tokensConsumed / tb) +
    0.3 * (resources.costConsumed / cb) +
    0.2 * (resources.timeConsumed / tmb)
  )
}

class SearchProgressWindow {
  constructor(options = {}) {
    this.windowMs = options.windowMs || SEARCH_PROGRESS_WINDOW_MS
    this.steps = []
    this.objectiveStart = null
    this.budgets = options.budgets || { tokenBudget: 100000, costBudget: 1.0, timeBudget: 600 }
  }

  /**
   * Pression normalisée — utilisée par searchYield ET stepYield.
   * Délegue vers la fonction partagée normalizedResourcePressure.
   */
  normalizedPressure(resources) {
    return normalizedResourcePressure(resources, this.budgets)
  }

  ensureObjectiveInitial(value) {
    if (this.objectiveStart === null) this.objectiveStart = value
  }

  /**
   * Les valeurs sont déjà pondérées par ingestEvent().
   * pushStep() stocke telles quelles.
   */
  pushStep(step) {
    const now = Date.now()
    this.steps.push({
      ts: now,
      evidenceGain: Number(step.evidenceGain || 0),
      uncertaintyReduction: Number(step.uncertaintyReduction || 0),
      constraintsResolved: Number(step.constraintsResolved || 0),
      verifiedArtifactDelta: Number(step.verifiedArtifactDelta || 0),
      objectiveDelta: Number(step.objectiveDelta || 0),
      hypothesisInformationGain: Number(step.hypothesisInformationGain || 0),
      tokensConsumed: Number(step.tokensConsumed || 0),
      timeConsumed: Number(step.timeConsumed || 0),
      costConsumed: Number(step.costConsumed || 0),
      provenance: step.provenance || PROVENANCE.SELF_REPORTED
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
      evidenceGain: evidence, uncertaintyReduction: uncertainty,
      constraintsResolved: constraints, verifiedArtifactDelta: artifacts,
      objectiveDelta: objective, hypothesisInformationGain: hypothesis
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
   * Pression normalisée — utilisée par searchYield ET stepYield.
   */
  normalizedPressure(resources) {
    return normalizedResourcePressure(resources, this.budgets)
  }

  stepYield(step) {
    const useful = (
      DEFAULT_EVIDENCE_WEIGHT * step.evidenceGain +
      DEFAULT_UNCERTAINTY_WEIGHT * step.uncertaintyReduction +
      DEFAULT_CONSTRAINT_WEIGHT * step.constraintsResolved +
      DEFAULT_ARTIFACT_WEIGHT * step.verifiedArtifactDelta +
      DEFAULT_OBJECTIVE_WEIGHT * step.objectiveDelta +
      DEFAULT_HYPOTHESIS_INFO_WEIGHT * step.hypothesisInformationGain
    )
    const pressure = this.normalizedPressure(step)
    if (pressure <= 0) return 0
    return useful / (0.001 + pressure)
  }

  /**
   * Détection de rendements décroissants via les yields normalisés.
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
    this.window = new SearchProgressWindow(options)
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

    const evidence = Number(payload.evidenceGain || 0)
    const uncertainty = Number(payload.uncertaintyReduction || 0)
    const constraints = Number(payload.constraintsResolved || 0)
    const artifacts = Number(payload.verifiedArtifactDelta || 0)
    const objective = Number(payload.objectiveDelta || 0)
    const hypothesis = Number(payload.hypothesisInformationGain || 0)
    const tokens = Number(payload.tokensConsumed || 0)
    const time = Number(payload.timeConsumed || 0)
    const cost = Number(payload.costConsumed || 0)

    this.window.pushStep({
      evidenceGain: evidence * PROVENANCE_WEIGHTS[provenance],
      uncertaintyReduction: uncertainty * PROVENANCE_WEIGHTS[provenance],
      constraintsResolved: constraints,
      verifiedArtifactDelta: artifacts,
      objectiveDelta: objective,
      hypothesisInformationGain: hypothesis * PROVENANCE_WEIGHTS[provenance],
      tokensConsumed: tokens, timeConsumed: time, costConsumed: cost,
      provenance
    })

    this.globalEvidence += evidence * PROVENANCE_WEIGHTS[provenance]
    this.globalUncertainty += uncertainty * PROVENANCE_WEIGHTS[provenance]
    this.globalConstraints += constraints
    this.globalArtifacts += artifacts
    this.globalObjective += objective
    this.globalHypothesisInfo += hypothesis * PROVENANCE_WEIGHTS[provenance]
    this.globalTokens += tokens
    this.globalTime += time
    this.globalCost += cost

    return this.report()
  }

  seedObjective(value) { this.window.ensureObjectiveInitial(value) }

  resetAfterEvent() {
    this.window.steps = []
  }

  setBudgets(budgets) {
    this.window.budgets = budgets
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

  searchYield(useful, resources) {
    const totalUseful = (
      DEFAULT_EVIDENCE_WEIGHT * useful.evidenceGain +
      DEFAULT_UNCERTAINTY_WEIGHT * useful.uncertaintyReduction +
      DEFAULT_CONSTRAINT_WEIGHT * useful.constraintsResolved +
      DEFAULT_ARTIFACT_WEIGHT * useful.verifiedArtifactDelta +
      DEFAULT_OBJECTIVE_WEIGHT * useful.objectiveDelta +
      DEFAULT_HYPOTHESIS_INFO_WEIGHT * useful.hypothesisInformationGain
    )
    const pressure = this.window.normalizedPressure(resources)
    if (pressure <= 0) return 0
    const eps = 0.001
    return totalUseful / (eps + pressure)
  }
}

module.exports = {
  SearchProgressWindow, CausalProgressService,
  DEFAULT_EVIDENCE_WEIGHT, DEFAULT_UNCERTAINTY_WEIGHT,
  DEFAULT_CONSTRAINT_WEIGHT, DEFAULT_ARTIFACT_WEIGHT,
  DEFAULT_OBJECTIVE_WEIGHT, DEFAULT_HYPOTHESIS_INFO_WEIGHT,
  PROVENANCE, PROVENANCE_WEIGHTS
}
