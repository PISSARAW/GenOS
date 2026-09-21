/**
 * Causal Progress Service — Senseur de progrès causal.
 *
 * Il construit le vecteur SearchProgress à partir des événements du runtime :
 *  - evidenceGain
 *  - uncertaintyReduction
 *  - constraintsResolved
 *  - verifiedArtifactDelta
 *  - objectiveDelta
 *  - hypothesisInformationGain
 *  - cost (tokensConsumed, timeConsumed, costConsumed)
 *
 * Il calcule ensuite searchYield = progrès utile / ressources consommées,
 * et produit des diagnostics : DIMINISHING_RETURNS, SEMANTIC_STAGNATION.
 */

const SEARCH_PROGRESS_WINDOW_MS = 90_000 // fenêtre glissante de 90 s
const DEFAULT_EVIDENCE_WEIGHT = 0.4
const DEFAULT_UNCERTAINTY_WEIGHT = 0.2
const DEFAULT_CONSTRAINT_WEIGHT = 0.1
const DEFAULT_ARTIFACT_WEIGHT = 0.15
const DEFAULT_OBJECTIVE_WEIGHT = 0.15

class SearchProgressWindow {
  constructor(windowMs = SEARCH_PROGRESS_WINDOW_MS) {
    this.windowMs = windowMs
    this.steps = []
    this.objectiveStart = null
  }

  /** Déclarer un état objectif initial, si absent */
  ensureObjectiveInitial(value) {
    if (this.objectiveStart === null) {
      this.objectiveStart = value
    }
  }

  /** Enregistrer un pas de recherche */
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
      costConsumed: Number(step.costConsumed || 0)
    })
    // éviction par fenêtre
    const cutoff = now - this.windowMs
    while (this.steps.length && this.steps[0].ts < cutoff) {
      this.steps.shift()
    }
  }

  /** Nettoyer les pas appartenant à une ancienne période */
  resetAfter(ts) {
    this.steps = this.steps.filter(s => s.ts > ts)
  }

  /** Somme utile du progrès dans la fenêtre */
  usefulProgress() {
    let evidence = 0
    let uncertainty = 0
    let constraints = 0
    let artifacts = 0
    let objective = 0
    let hypothesis = 0
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

  /** Ressources consommées dans la fenêtre */
  resourceConsumption() {
    let tokens = 0, time = 0, cost = 0
    for (const s of this.steps) {
      tokens += s.tokensConsumed
      time += s.timeConsumed
      cost += s.costConsumed
    }
    return { tokensConsumed: tokens, timeConsumed: time, costConsumed: cost }
  }

  /** Nombre d'étapes dans la fenêtre */
  stepCount() {
    return this.steps.length
  }

  /**
   * Détecter les rendements décroissants.
   * Comparaison des deux derniers pas : si le second est nettement inférieur
   * au premier, le patch produit des rendements décroissants.
   */
  detectDiminishingReturns(threshold = 0.5) {
    const n = this.steps.length
    if (n < 2) return false
    const recent = this.steps.slice(-2)
    const firstUseful = this.weightedUseful(recent[0])
    const secondUseful = this.weightedUseful(recent[1])
    if (firstUseful <= 0) return false
    const ratio = secondUseful / firstUseful
    return ratio < threshold
  }

  /** Valeur pondérée d'un pas */
  weightedUseful(step) {
    return (
      DEFAULT_EVIDENCE_WEIGHT * step.evidenceGain +
      DEFAULT_UNCERTAINTY_WEIGHT * step.uncertaintyReduction +
      DEFAULT_CONSTRAINT_WEIGHT * step.constraintsResolved +
      DEFAULT_ARTIFACT_WEIGHT * step.verifiedArtifactDelta +
      DEFAULT_OBJECTIVE_WEIGHT * step.objectiveDelta
    )
  }

  /** Somme pondérée utile dans la fenêtre */
  weightedUsefulTotal() {
    let total = 0
    for (const s of this.steps) {
      total += this.weightedUseful(s)
    }
    return total
  }

  /** Estimation du progrès objectif global depuis l'initialisation */
  objectiveProgress() {
    if (this.objectiveStart === null) return 0
    let delta = 0
    for (const s of this.steps) {
      delta += s.objectiveDelta
    }
    // valeur relative simple
    const total = Math.abs(this.objectiveStart) + Math.abs(delta)
    if (total === 0) return 0
    return delta / total
  }
}

/**
 * CausalProgressService
 *
 * Reçoit les événements du runtime et produit un SearchProgressWindow
 * enrichi. Exporté pour être branché dans le pipeline d'événements.
 */
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
    this.finalEvents = new Set([
      'AGENT_COMPLETED',
      'AGENT_FAILED',
      'AGENT_RUNTIME_ERROR',
      'WORKER_TASK_FAILED',
      'WORKER_NO_ANSWER_PROVEN',
      'MISSION_NO_ANSWER_PROVEN'
    ])
  }

  /**
   * Injecter un événement d'exécution et mettre à jour les mesures.
   * Retourne le rapport SearchProgress brut.
   */
  ingestEvent(event) {
    if (!event || typeof event !== 'object') return this.report()

    const payload = event.payload || {}
    const evidence = Number(payload.evidenceGain || event.evidenceGain || 0)
    const uncertainty = Number(payload.uncertaintyReduction || event.uncertaintyReduction || 0)
    const constraints = Number(payload.constraintsResolved || event.constraintsResolved || 0)
    const artifacts = Number(payload.verifiedArtifactDelta || event.verifiedArtifactDelta || 0)
    const objective = Number(payload.objectiveDelta || event.objectiveDelta || 0)
    const hypothesis = Number(payload.hypothesisInformationGain || event.hypothesisInformationGain || 0)
    const tokens = Number(payload.tokensConsumed || event.tokensConsumed || 0)
    const time = Number(payload.timeConsumed || event.timeConsumed || 0)
    const cost = Number(payload.costConsumed || event.costConsumed || 0)

    this.window.pushStep({
      evidenceGain: evidence,
      uncertaintyReduction: uncertainty,
      constraintsResolved: constraints,
      verifiedArtifactDelta: artifacts,
      objectiveDelta: objective,
      hypothesisInformationGain: hypothesis,
      tokensConsumed: tokens,
      timeConsumed: time,
      costConsumed: cost
    })

    // agrégats globaux (hors fenêtre)
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

  /** Déclarer le point objectif initial (si pas déjà fait) */
  seedObjective(value) {
    this.window.ensureObjectiveInitial(value)
  }

  /** Reset partiel après un événement final (fork / nouvelle branche) */
  resetAfterEvent(event) {
    if (!event) return
    this.window.resetAfter(Date.now() - this.windowMs - 1)
    // on conserve les agrégats globaux, car ils servent la mémoire à plus long terme
  }

  /** Rapport SearchProgress complet : fenêtre + globale */
  report() {
    const win = this.window
    const wUseful = win.usefulProgress()
    const wRes = win.resourceConsumption()
    const wSteps = win.stepCount()
    const wYield = this.searchYield(wUseful, wRes)

    return {
      // fenêtre glissante
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
      // agrégats globaux (persistants)
      global: {
        evidenceGain: this.globalEvidence,
        uncertaintyReduction: this.globalUncertainty,
        constraintsResolved: this.globalConstraints,
        verifiedArtifactDelta: this.globalArtifacts,
        objectiveDelta: this.globalObjective,
        hypothesisInformationGain: this.globalHypothesisInfo,
        tokensConsumed: this.globalTokens,
        timeConsumed: this.globalTime,
        costConsumed: this.globalCost
      },
      // diagnostics
      diagnostics: {
        diminishingReturns: win.detectDiminishingReturns(),
        stepsInWindow: wSteps,
        objectiveProgress: win.objectiveProgress()
      }
    }
  }

  /**
   * Calcul du rendement de recherche.
   * searchYield = progrès utile pondéré / ressources consommées.
   * Si aucune ressource consommée, rendement = 0 par sécurité.
   */
  searchYield(useful, resources) {
    const totalUseful = (
      DEFAULT_EVIDENCE_WEIGHT * useful.evidenceGain +
      DEFAULT_UNCERTAINTY_WEIGHT * useful.uncertaintyReduction +
      DEFAULT_CONSTRAINT_WEIGHT * useful.constraintsResolved +
      DEFAULT_ARTIFACT_WEIGHT * useful.verifiedArtifactDelta +
      DEFAULT_OBJECTIVE_WEIGHT * useful.objectiveDelta
    )
    const totalResources = resources.tokensConsumed + resources.timeConsumed + resources.costConsumed
    if (totalResources <= 0) return 0
    return totalUseful / totalResources
  }
}

module.exports = {
  SearchProgressWindow,
  CausalProgressService,
  DEFAULT_EVIDENCE_WEIGHT,
  DEFAULT_UNCERTAINTY_WEIGHT,
  DEFAULT_CONSTRAINT_WEIGHT,
  DEFAULT_ARTIFACT_WEIGHT,
  DEFAULT_OBJECTIVE_WEIGHT
}
