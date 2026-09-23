'use strict';

/**
 * Cognitive Key System — machine à états des phases cognitives (ADR 0033,
 * points 5-6).
 *
 * Cinq phases ordonnées pilotent le phénotype cognitif pendant la mission :
 *
 *   DISCOVERY      → exploration, formulation d'hypothèses
 *   DIAGNOSIS      → analyse des causes, reconnaissance de motifs
 *   IMPLEMENTATION → construction, exécution de la solution
 *   VERIFICATION   → tests, validation, falsification
 *   SYNTHESIS       → réconciliation, conclusion
 *
 * Chaque phase recommande un sous-ensemble de CognitiveKeys adapté à
 * l'activité cognitive dominante. Les transitions s'appuient sur des
 * preuves de sortie et la confiance épistémique.
 *
 * Le service est déterministe : pas de LLM, pas de random.
 */

const { COGNITIVE_KEYS } = require('../../cognition/cognitiveKeyDefinitions');

const PHASES = Object.freeze([
  'DISCOVERY',
  'DIAGNOSIS',
  'IMPLEMENTATION',
  'VERIFICATION',
  'SYNTHESIS'
]);

const PHASE_PROFILES = Object.freeze({
  DISCOVERY: Object.freeze({
    description: 'Exploration initiale et formulation d\'hypothèses',
    recommendedKeys: Object.freeze([
      'cognitive.epistemology.hypothesis-generation',
      'cognitive.epistemology.question-formulation',
      'cognitive.structure.framing'
    ]),
    exitEvidence: Object.freeze(['problem-understood', 'initial-hypotheses'])
  }),
  DIAGNOSIS: Object.freeze({
    description: 'Analyse des causes profondes et reconnaissance de motifs',
    recommendedKeys: Object.freeze([
      'cognitive.epistemology.causal-analysis',
      'cognitive.logic.boundary-detection',
      'cognitive.structure.relationship-mapping'
    ]),
    exitEvidence: Object.freeze(['root-cause-identified', 'pattern-recognized'])
  }),
  IMPLEMENTATION: Object.freeze({
    description: 'Construction de la solution et exécution',
    recommendedKeys: Object.freeze([
      'cognitive.interpretation.play',
      'cognitive.perspective.viewpoint-shift',
      'cognitive.logic.self-reference'
    ]),
    exitEvidence: Object.freeze(['solution-built', 'implementation-complete'])
  }),
  VERIFICATION: Object.freeze({
    description: 'Tests, validation et falsification',
    recommendedKeys: Object.freeze([
      'cognitive.epistemology.falsification',
      'cognitive.logic.limit-analysis',
      'cognitive.perspective.ethical-reasoning'
    ]),
    exitEvidence: Object.freeze(['tests-passed', 'validation-complete'])
  }),
  SYNTHESIS: Object.freeze({
    description: 'Réconciliation et conclusion',
    recommendedKeys: Object.freeze([
      'cognitive.perspective.reconciliation',
      'cognitive.interpretation.variation',
      'cognitive.structure.categorization'
    ]),
    exitEvidence: Object.freeze(['synthesis-complete', 'conclusion-drawn'])
  })
});

function keyMapOf(keys) {
  return new Map(keys.map((key) => [key.id, key]));
}

function getCurrentPhase(ctx) {
  if (!ctx) return 'DISCOVERY';
  const explicitPhase = ctx.currentPhase;
  if (explicitPhase && PHASES.includes(explicitPhase)) return explicitPhase;
  const progress = ctx.missionProgress || 0;
  if (progress < 0.2) return 'DISCOVERY';
  if (progress < 0.4) return 'DIAGNOSIS';
  if (progress < 0.6) return 'IMPLEMENTATION';
  if (progress < 0.8) return 'VERIFICATION';
  return 'SYNTHESIS';
}

function transitionPhase(ctx) {
  const currentPhase = ctx.currentPhase || getCurrentPhase(ctx);
  const evidence = ctx.evidence || [];
  const epistemicState = ctx.epistemicState || {};
  const profile = PHASE_PROFILES[currentPhase];
  if (!profile) return { phase: currentPhase, transitioned: false };
  const hasExitEvidence = profile.exitEvidence.some((signal) => evidence.includes(signal));
  const confidence = epistemicState.confidence || 0;
  if (hasExitEvidence && confidence > 0.5) {
    const currentIndex = PHASES.indexOf(currentPhase);
    if (currentIndex < PHASES.length - 1) {
      const nextPhase = PHASES[currentIndex + 1];
      return { phase: nextPhase, transitioned: true, reason: 'evidence-threshold-met' };
    }
  }
  return { phase: currentPhase, transitioned: false };
}

function getPhaseCognitiveProfile(phase) {
  const profile = PHASE_PROFILES[phase];
  if (!profile) return null;
  const keyMap = keyMapOf(COGNITIVE_KEYS);
  const availableKeys = profile.recommendedKeys.filter((id) => keyMap.has(id));
  return {
    phase,
    description: profile.description,
    recommendedKeys: availableKeys,
    exitEvidence: [...profile.exitEvidence]
  };
}

module.exports = {
  PHASES,
  getCurrentPhase,
  transitionPhase,
  getPhaseCognitiveProfile
};
