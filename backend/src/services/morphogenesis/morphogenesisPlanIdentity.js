'use strict';

/**
 * MorphogenesisPlanIdentity — X14 : Self + instinct + creativity +
 * communication + ancestral -> MorphogenesisPlanner.
 *
 * Chaque builder prend (expression, ctx) : max 2 params effectifs via
 * un seul objet, CC <= 10. Produit les champs :
 * selfRegulationChanges, instinctResponses, creativeModeChanges,
 * communicationChanges, ancestralEvidence.
 */

const { resolveCreativity } = require('../agents/creativePressureResolverService');
const { evaluateInstincts } = require('../agents/instinctRuntimeService');

function selfChangesOf(expression) {
  const regulation = expression.cognitiveRegulation || {};
  const pressure = expression.currentPressure || {};
  if (regulation.isApoptotic) return [{ kind: 'apoptosis_guard', action: 'halt_spawn' }];
  if ((pressure.stress || 0) > 0.7) return [{ kind: 'stress_relief', action: 'reduce_scope' }];
  if ((regulation.dissonanceLevel || 0) > 0.6) return [{ kind: 'dissonance_repair', action: 'request_evidence' }];
  return [];
}

function instinctOf(expression, event) {
  const actions = evaluateInstincts({ agentExpressionContext: expression, event });
  return actions.map((item) => ({ signal: item.signal, severity: item.payload?.severity || 'info' }));
}

function creativityOf(expression, problem) {
  const decision = resolveCreativity({ agentExpressionContext: expression, problemState: problem });
  if (decision.level === 0) return [];
  return [{ level: decision.levelName, mechanisms: decision.affordableMechanisms }];
}

function communicationOf(expression, checkpoint) {
  const manifest = expression.communicationManifest || {};
  const channels = manifest.allowedChannels || manifest.channels || [];
  if (channels.length === 0) return [{ decision: 'SILENCE', reason: 'no_channel' }];
  return [{ decision: 'EVALUATE', checkpoint: checkpoint || 'MANUAL', channels }];
}

function ancestralOf(searchResult) {
  if (!searchResult) return [];
  return (searchResult.evidences || []).map((item) => ({
    fossilId: item.fossilId,
    similarity: item.similarity,
    priorKind: item.priorKind
  }));
}

function buildIdentityExtensions(input) {
  const expression = input.expression || {};
  return {
    selfRegulationChanges: selfChangesOf(expression),
    instinctResponses: instinctOf(expression, input.event),
    creativeModeChanges: creativityOf(expression, input.problem),
    communicationChanges: communicationOf(expression, input.checkpoint),
    ancestralEvidence: ancestralOf(input.ancestral)
  };
}

module.exports = { buildIdentityExtensions };
