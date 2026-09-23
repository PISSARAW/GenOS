/**
 * Natural Search Controller v5 — avec niveaux de processus pour hystérésis correcte.
 */

const { SearchPressureModel, ESCALATION_RADII } = require('./searchPressureService')
const { classifySearchState, SEARCH_STATE } = require('./entropyProgressClassifier')
const { SEARCH_PROCESS } = require('./searchProcessTypes')

// Niveaux pour déterminer les transitions autorisées
const PROCESS_LEVEL = {
  [SEARCH_PROCESS.CONTINUE]: 0,
  [SEARCH_PROCESS.FORAGE]: 1,
  [SEARCH_PROCESS.PLASTICITE]: 2,
  [SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]: 3,
  [SEARCH_PROCESS.REPLAY_CAUSAL]: 3,
  [SEARCH_PROCESS.STRESS_HYPERMUTATION]: 4,
  [SEARCH_PROCESS.SPECIATION]: 5,
  [SEARCH_PROCESS.EVOLUTION]: 6
};

const PHASE_ENTER = {
  [SEARCH_PROCESS.PLASTICITE]: 0.35,
  [SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]: 0.55,
  [SEARCH_PROCESS.STRESS_HYPERMUTATION]: 0.60,
  [SEARCH_PROCESS.SPECIATION]: 0.91
};
const PHASE_EXIT = {
  [SEARCH_PROCESS.PLASTICITE]: 0.25,
  [SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]: 0.40,
  [SEARCH_PROCESS.STRESS_HYPERMUTATION]: 0.50,
  [SEARCH_PROCESS.SPECIATION]: 0.80
};
const MIN_DWELL_STEPS = 3;

class NaturalSearchController {
  constructor(options = {}) {
    this.pressureModel = new SearchPressureModel(options.pressure);
    this.history = [];
    this.lastProcess = null;
    this.stepsInCurrentProcess = 0;
    this.stepsSinceChange = 0;
    this.ledger = options.ledger || null;
  }

  selectProcess(ctx) {
    const pressure = this.pressureModel.update({
      searchYield: ctx.searchYield,
      stepsSinceProgress: ctx.stepsSinceProgress,
      falsifiedHypotheses: ctx.falsifiedHypotheses,
      contradictions: ctx.contradictions,
      budgetRatio: ctx.budgetRatio
    });

    const classification = classifySearchState(
      ctx.agentId,
      ctx.causalProgressReport,
      ctx.entropyMetrics
    );

    let lockInHypothesis = null;
    if (this.ledger && classification.state === SEARCH_STATE.MEDIUM_VARIATION_STAGNATION) {
      const lockIns = this.ledger.detectLockIn();
      if (lockIns.length > 0) lockInHypothesis = lockIns[0];
    }

    let process = this.lastProcess;
    let diagnostics = {};
    const p = pressure.pressure;

    // Déterminer le processus désiré
    const hasSignificantLineagePressure = ctx.lineagePressure &&
      (ctx.lineagePressure.falsifiedCount >= 3 || ctx.lineagePressure.supportedCount >= 3);

    let desired;
    if (hasSignificantLineagePressure) {
      desired = SEARCH_PROCESS.EVOLUTION;
    } else if (p < PHASE_ENTER[SEARCH_PROCESS.PLASTICITE]) {
      if (ctx.searchYield !== undefined && ctx.searchYield < 0.05) {
        desired = SEARCH_PROCESS.FORAGE;
      } else {
        desired = SEARCH_PROCESS.CONTINUE;
      }
    } else if (p < PHASE_ENTER[SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH]) {
      desired = SEARCH_PROCESS.PLASTICITE;
    } else if (p < PHASE_ENTER[SEARCH_PROCESS.STRESS_HYPERMUTATION]) {
      if (lockInHypothesis || ctx.falsifiedHypotheses > 0) {
        desired = SEARCH_PROCESS.REPLAY_CAUSAL;
      } else {
        desired = SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH;
      }
    } else if (p < PHASE_ENTER[SEARCH_PROCESS.SPECIATION]) {
      desired = SEARCH_PROCESS.STRESS_HYPERMUTATION;
    } else {
      desired = (ctx.falsifiedHypotheses >= 3) ? SEARCH_PROCESS.SPECIATION : SEARCH_PROCESS.STRESS_HYPERMUTATION;
    }

    // Hystérésis : bloquer uniquement les downgrades prématurés
    const currentLevel = PROCESS_LEVEL[this.lastProcess] ?? -1;
    const desiredLevel = PROCESS_LEVEL[desired] ?? -1;

    if (this.lastProcess && desiredLevel < currentLevel) {
      // Downgrade — vérifier seuil de sortie + dwell
      const exitThresh = PHASE_EXIT[this.lastProcess];
      if (exitThresh !== undefined && p < exitThresh && this.stepsSinceChange >= MIN_DWELL_STEPS) {
        process = desired;
        diagnostics = { reason: `downgrade from ${this.lastProcess} to ${desired} (p=${p.toFixed(3)} < exit=${exitThresh}, dwell=${this.stepsSinceChange})` };
      } else {
        process = this.lastProcess;
        diagnostics = { reason: `hysteresis hold on ${this.lastProcess} (desired: ${desired}, p=${p.toFixed(3)}, exit=${exitThresh}, dwell=${this.stepsSinceChange})` };
      }
    } else {
      // Upgrade ou maintien — toujours autoriser
      process = desired;
      if (desiredLevel > currentLevel && this.lastProcess) {
        diagnostics = { reason: `escalade from ${this.lastProcess} to ${desired} (p=${p.toFixed(3)})` };
      } else if (!this.lastProcess) {
        diagnostics = { reason: `initial process: ${desired}` };
      }
    }

    // Mise à jour des compteurs : stepsSinceChange = steps depuis dernier changement
    if (process !== this.lastProcess) {
      this.stepsSinceChange = 0;
      this.stepsInCurrentProcess = 0;
    } else {
      this.stepsSinceChange++;
      this.stepsInCurrentProcess++;
    }
    this.lastProcess = process;

    return {
      process,
      pressure: p,
      recommendedRadius: pressure.recommendedRadius,
      classification: lockInHypothesis ? 'HYPOTHESIS_LOCK_IN' : classification.state,
      diagnostics,
      causes: pressure.causes
    };
  }

  recordSelection(selection) {
    this.history.push({ ts: Date.now(), ...selection });
    if (this.history.length > 100) this.history.shift();
  }

  getHistory() { return this.history.slice(); }
}

module.exports = { NaturalSearchController, SEARCH_PROCESS, PHASE_ENTER, PHASE_EXIT, MIN_DWELL_STEPS };
