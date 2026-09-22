/**
 * Natural Search Controller v4.
 *
 * P0 fixes:
 *  - Lock-in determined via HypothesisLedger.detectLockIn(), not just classifier
 *  - Hysteresis via enter/exit thresholds
 *  - Uses structured proofs from Ledger
 */

const { SearchPressureModel, ESCALATION_RADII } = require('./searchPressureService')
const { classifySearchState, SEARCH_STATE } = require('./entropyProgressClassifier')

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

// Hysteresis thresholds
const PHASE_ENTER = {
  [SEARCH_PROCESS.PLASTICITE]: 0.45,
  [SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]: 0.65,
  [SEARCH_PROCESS.STRESS_HYPERMUTATION]: 0.78,
  [SEARCH_PROCESS.SPECIATION]: 0.91
}
const PHASE_EXIT = {
  [SEARCH_PROCESS.PLASTICITE]: 0.32,
  [SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]: 0.50,
  [SEARCH_PROCESS.STRESS_HYPERMUTATION]: 0.65,
  [SEARCH_PROCESS.SPECIATION]: 0.80
}
const MIN_DWELL_STEPS = 3

class NaturalSearchController {
  constructor(options = {}) {
    this.pressureModel = new SearchPressureModel(options.pressure)
    this.history = []
    this.lastProcess = null
    this.stepsInCurrentProcess = 0
    this.stepsSinceChange = 0
    this.ledger = options.ledger || null
  }

  selectProcess(ctx) {
    const pressure = this.pressureModel.update({
      searchYield: ctx.searchYield,
      stepsSinceProgress: ctx.stepsSinceProgress,
      falsifiedHypotheses: ctx.falsifiedHypotheses,
      contradictions: ctx.contradictions,
      budgetRatio: ctx.budgetRatio
    })

    const classification = classifySearchState(
      ctx.agentId,
      ctx.causalProgressReport,
      ctx.entropyMetrics
    )

    // Use Ledger to confirm lock-in
    let lockInHypothesis = null
    if (this.ledger && classification.state === SEARCH_STATE.MEDIUM_VARIATION_STAGNATION) {
      const lockIns = this.ledger.detectLockIn()
      if (lockIns.length > 0) {
        lockInHypothesis = lockIns[0]
      }
    }

    let process = this.lastProcess
    let diagnostics = {}
    const p = pressure.pressure

    // Track steps since last process change (before deciding)
    if (this.lastProcess) {
      this.stepsSinceChange++
    } else {
      this.stepsSinceChange = 1
    }

    // Hysteresis: hold current process if exit threshold not yet crossed
    // or minimum dwell time not yet satisfied.
    const exitThresh = PHASE_EXIT[this.lastProcess]
    let holdProcess = false
    if (this.lastProcess && exitThresh !== undefined) {
      if (p < exitThresh && this.stepsSinceChange >= MIN_DWELL_STEPS) {
        // Exit threshold crossed + dwell satisfied → allow transition
        holdProcess = false
      } else {
        // Either still above exit threshold, or dwell not yet satisfied → hold
        holdProcess = true
      }
    }

    if (holdProcess) {
      diagnostics = { reason: `hysteresis hold on ${this.lastProcess}` }
    } else {
      // Determine process based on current pressure
      const hasSignificantLineagePressure = ctx.lineagePressure &&
        (ctx.lineagePressure.falsifiedCount >= 3 || ctx.lineagePressure.supportedCount >= 3)

      if (hasSignificantLineagePressure) {
        process = SEARCH_PROCESS.EVOLUTION
        diagnostics = { reason: 'lineage pressure — evolution triggered' }
      } else if (p < PHASE_ENTER[SEARCH_PROCESS.PLASTICITE]) {
        if (ctx.searchYield !== undefined && ctx.searchYield < 0.05) {
          process = SEARCH_PROCESS.FORAGE
          diagnostics = { reason: 'low yield — forage' }
        } else {
          process = SEARCH_PROCESS.CONTINUE
          diagnostics = { reason: 'low pressure — continue' }
        }
      } else if (p < PHASE_ENTER[SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]) {
        process = SEARCH_PROCESS.PLASTICITE
        diagnostics = { reason: 'moderate pressure — plasticity' }
      } else if (p < PHASE_ENTER[SEARCH_PROCESS.STRESS_HYPERMUTATION]) {
        if (lockInHypothesis) {
          process = SEARCH_PROCESS.REPLAY_CAUSAL
          diagnostics = { reason: `lock-in on ${lockInHypothesis.hypothesisId} — causal replay` }
        } else if (ctx.falsifiedHypotheses > 0) {
          process = SEARCH_PROCESS.REPLAY_CAUSAL
          diagnostics = { reason: 'falsified hypothesis — revert' }
        } else {
          process = SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH
          diagnostics = { reason: 'promising zone — affinity search' }
        }
      } else if (p < PHASE_ENTER[SEARCH_PROCESS.SPECIATION]) {
        process = SEARCH_PROCESS.STRESS_HYPERMUTATION
        diagnostics = { reason: 'high pressure — hypermutation' }
      } else {
        if (ctx.falsifiedHypotheses >= 3) {
          process = SEARCH_PROCESS.SPECIATION
          diagnostics = { reason: 'multiple failures — speciation' }
        } else {
          process = SEARCH_PROCESS.STRESS_HYPERMUTATION
          diagnostics = { reason: 'very high pressure — radical hypermutation' }
        }
      }
    }

    if (process !== this.lastProcess) {
      this.stepsInCurrentProcess = 0
    } else {
      this.stepsInCurrentProcess++
    }
    this.lastProcess = process

    return {
      process,
      pressure: p,
      recommendedRadius: pressure.recommendedRadius,
      classification: lockInHypothesis ? 'HYPOTHESIS_LOCK_IN' : classification.state,
      diagnostics,
      causes: pressure.causes
    }
  }

  recordSelection(selection) {
    this.history.push({ ts: Date.now(), ...selection })
    if (this.history.length > 100) this.history.shift()
  }

  getHistory() { return this.history.slice() }
}

module.exports = { NaturalSearchController, SEARCH_PROCESS, PHASE_ENTER, PHASE_EXIT }
