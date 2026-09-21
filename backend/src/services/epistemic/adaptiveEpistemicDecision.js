'use strict';

const {
  adaptiveCheck,
  adaptiveResponse,
  needsAdaptiveResponse,
  adaptiveTriggerScore,
} = require('./adaptiveEpistemicResponse');

function decisionFromAdaptive(claim, antigen, context = {}) {
  const evaluation = adaptiveCheck(antigen, context);
  const response = adaptiveResponse(evaluation, context.verifierCatalog, context);
  const signals = evaluation.adaptive.signals || [];
  const triggerScore = evaluation.adaptive.triggerScore;

  let finalDecision = 'accepter';
  if (evaluation.innate.decision.action === 'neutralize') {
    finalDecision = 'neutraliser';
  } else if (evaluation.innate.decision.action === 'quarantine') {
    finalDecision = 'quarantaine';
  }

  if (evaluation.adaptive.triggered) {
    if (triggerScore >= 0.7) finalDecision = 'quarantaine_adaptative';
    else if (triggerScore >= 0.4) finalDecision = 'vérification_adaptative';
  }

  return {
    claim,
    antigenId: antigen.id,
    innate: {
      signals: evaluation.innate.signals,
      dangerTotal: evaluation.innate.totalDanger,
      decision: evaluation.innate.decision,
    },
    adaptive: {
      triggered: evaluation.adaptive.triggered,
      signals,
      triggerScore,
      verifierAssignments: response.verifierAssignments || [],
    },
    decision: finalDecision,
    timestamp: new Date().toISOString(),
  };
}

function summarize(decision) {
  if (!decision) return null;
  return {
    claim: decision.claim,
    decision: decision.decision,
    innateSignals: decision.innate.signals.length,
    adaptiveTriggered: decision.adaptive.triggered,
    triggerScore: decision.adaptive.triggerScore,
    verifierAssignments: decision.adaptive.verifierAssignments.length,
  };
}

function describe(decision) {
  if (!decision) return 'Aucune décision';
  const lines = [
    `Décision: ${decision.decision}`,
    `Danger inné: ${decision.innate.dangerTotal.toFixed(2)} (${decision.innate.signals.length} signaux)`,
    `Adaptatif: ${decision.adaptive.triggered ? 'déclenché (score ' + decision.adaptive.triggerScore.toFixed(2) + ')' : 'non déclenché'}`,
  ];
  if (decision.adaptive.verifierAssignments && decision.adaptive.verifierAssignments.length) {
    lines.push('Vérifications assignées: ' + decision.adaptive.verifierAssignments.map(v => v.type + ' → ' + v.verifier).join(', '));
  }
  return lines.join('\n');
}

module.exports = {
  decisionFromAdaptive,
  summarize,
  describe,
  adaptiveCheck,
  adaptiveResponse,
  needsAdaptiveResponse,
  adaptiveTriggerScore,
};
