'use strict';

const LEVELS = Object.freeze(['simple', 'difficult', 'open']);
const SPECS = Object.freeze({
  'ETT-01': { name: 'curiosite-spontanee', objective: 'Choose the unexplained anomaly worth investigating.', metric: 'outlierDistance' },
  'ETT-02': { name: 'chaine-autonome', objective: 'Choose the next experiment with validated progress and few sterile cycles.', metric: 'validatedProgress' },
  'ETT-03': { name: 'hypotheses-falsifiables', objective: 'Choose the intervention that best separates competing causes.', metric: 'causalSeparation' },
  'ETT-04': { name: 'apprentissage-cumulatif', objective: 'Choose the skill with the strongest held-out transfer.', metric: 'heldoutTransfer' },
  'ETT-05': { name: 'autocritique-correction', objective: 'Choose the report whose contradiction is independently reproducible.', metric: 'verifiedCorrection' },
  'ETT-06': { name: 'revision-epistemique', objective: 'Choose the belief best updated by the new evidence.', metric: 'posteriorSupport' },
  'ETT-07': { name: 'reprise-continuite', objective: 'Choose the checkpoint that resumes without losing or duplicating work.', metric: 'resumeIntegrity' },
  'ETT-08': { name: 'arret-rationnel', objective: 'Choose whether the expected value of the next investigation exceeds its cost.', metric: 'netInformationValue' },
  'ETT-09': { name: 'decouverte-inattendue', objective: 'Choose the latent rule with the strongest fresh-state predictions.', metric: 'freshPredictionValue' },
  'ETT-10': { name: 'auto-amelioration', objective: 'Choose the strategy change that improves held-out performance without regression.', metric: 'safeHeldoutGain' },
  'ETT-11': { name: 'recherche-collective', objective: 'Choose the merged conclusion with complementary facts and resolved conflicts.', metric: 'collectiveEvidence' },
  'ETT-12': { name: 'autonomie-longue-duree', objective: 'Choose the investigation with durable progress and the fewest repeated cycles.', metric: 'longHorizonYield' }
});
const SCENARIO_IDS = Object.freeze(Object.keys(SPECS));
const METRIC_FIELDS = Object.freeze({
  'ETT-01': ['outlierDistance', 'salience'],
  'ETT-02': ['validatedProgress', 'sterileCycles', 'salience'],
  'ETT-03': ['causalSeparation', 'confidence'],
  'ETT-04': ['heldoutTransfer', 'confidence'],
  'ETT-05': ['verifiedCorrection', 'confidence'],
  'ETT-06': ['posteriorSupport', 'confidence'],
  'ETT-07': ['resumeIntegrity', 'confidence'],
  'ETT-08': ['netInformationValue', 'cost'],
  'ETT-09': ['freshPredictionValue', 'confidence'],
  'ETT-10': ['safeHeldoutGain', 'confidence'],
  'ETT-11': ['collectiveEvidence', 'unresolvedConflicts'],
  'ETT-12': ['longHorizonYield', 'repeatedCycles']
});

function seeded(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomMetric(random) {
  return Math.round(random() * 1000) / 10;
}

function generateMetrics(random) {
  return {
    outlierDistance: randomMetric(random), validatedProgress: randomMetric(random),
    sterileCycles: Math.floor(random() * 8), causalSeparation: randomMetric(random),
    heldoutTransfer: randomMetric(random), verifiedCorrection: randomMetric(random),
    posteriorSupport: randomMetric(random), resumeIntegrity: randomMetric(random),
    netInformationValue: randomMetric(random) - 50, freshPredictionValue: randomMetric(random),
    safeHeldoutGain: randomMetric(random) - 25, collectiveEvidence: randomMetric(random),
    unresolvedConflicts: Math.floor(random() * 6), longHorizonYield: randomMetric(random),
    repeatedCycles: Math.floor(random() * 12), salience: randomMetric(random),
    confidence: randomMetric(random), cost: randomMetric(random)
  };
}

function scoreETT02(metrics) {
  return metrics.validatedProgress - (metrics.sterileCycles * 4);
}

function scoreETT08(metrics) {
  return metrics.netInformationValue - metrics.cost;
}

function scoreETT10(metrics) {
  return metrics.safeHeldoutGain;
}

function scoreETT11(metrics) {
  return metrics.collectiveEvidence - (metrics.unresolvedConflicts * 5);
}

function scoreETT12(metrics) {
  return metrics.longHorizonYield - (metrics.repeatedCycles * 3);
}

const SCORERS = Object.freeze({
  'ETT-01': (m) => m.outlierDistance,
  'ETT-02': scoreETT02,
  'ETT-03': (m) => m.causalSeparation,
  'ETT-04': (m) => m.heldoutTransfer,
  'ETT-05': (m) => m.verifiedCorrection,
  'ETT-06': (m) => m.posteriorSupport,
  'ETT-07': (m) => m.resumeIntegrity,
  'ETT-08': scoreETT08,
  'ETT-09': (m) => m.freshPredictionValue,
  'ETT-10': scoreETT10,
  'ETT-11': scoreETT11,
  'ETT-12': scoreETT12
});

function buildCase(scenarioId, difficulty, seed) {
  const spec = SPECS[scenarioId];
  if (!spec || !LEVELS.includes(difficulty) || !Number.isSafeInteger(seed)) {
    throw new TypeError('Unknown scenario, difficulty, or seed.');
  }
  const random = seeded(seed ^ (Number(scenarioId.slice(4)) * 7919));
  const size = difficulty === 'simple' ? 3 : difficulty === 'difficult' ? 6 : 9;
  const candidates = Array.from({ length: size }, (_, index) => ({
    id: `candidate-${index}`, metrics: Object.fromEntries(Object.entries(generateMetrics(random))
      .filter(([field]) => METRIC_FIELDS[scenarioId].includes(field)))
  }));
  const ranked = [...candidates].sort((left, right) =>
    SCORERS[scenarioId](right.metrics) - SCORERS[scenarioId](left.metrics));
  const publicCase = {
    scenarioId, difficulty, caseId: `${scenarioId}-${difficulty}-${seed}`,
    observation: { scenario: spec.name, objective: spec.objective, candidates },
    budget: difficulty === 'open' ? 12 : difficulty === 'difficult' ? 8 : 5
  };
  return { ...publicCase, oracle: { answerId: ranked[0].id, runnerUpId: ranked[1].id } };
}

function referenceScore(scenarioId, metrics) {
  const score = SCORERS[scenarioId];
  if (!score) throw new TypeError(`Unknown scenario: ${scenarioId}`);
  return score(metrics);
}

function validateProposal(proposal) {
  return proposal && typeof proposal.answerId === 'string'
    && Array.isArray(proposal.evidenceRefs) && Number.isInteger(proposal.actions)
    && proposal.actions >= 0;
}

module.exports = { SCENARIO_IDS, LEVELS, SPECS, buildCase, referenceScore, validateProposal };
