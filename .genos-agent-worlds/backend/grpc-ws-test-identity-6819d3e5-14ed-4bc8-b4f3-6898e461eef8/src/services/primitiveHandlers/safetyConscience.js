/**
 * Primitives d'evaluation de conscience cognitive
 * (conscienceEvaluate, conscienceEureka)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');

/**
 * Evalue la conscience cognitive de l'agent (dissonance, harmonie, seuil apoptotique).
 */
async function conscienceEvaluate(context = {}) {
  const agentConscience = require('../agentConscienceService');
  const db = await getDatabase();
  const agentId = context.targetId || context.agentId || 'strategy_agent';
  const state = await agentConscience.loadConscienceState(db, agentId);

  const evalResult = agentConscience.evaluateBranch(state, {
    errorsInLoop: context.errorsInLoop || 0,
    progressScore: context.progressScore || 0,
    cognitiveHealth: context.cognitiveHealth || {}
  });

  try {
    await agentConscience.persistConscienceState(db, agentId, state, { reason: 'primitive_evaluate' });
  } catch (_) {}

  telemetry.emitEvent({
    eventType: 'CONSCIENCE_EVALUATED',
    agentId,
    action: 'EVALUATE',
    detail: `Conscience state: dissonance=${state.dissonanceLevel.toFixed(1)}, harmony=${evalResult.harmony}%, apoptotic=${evalResult.apoptoticTriggered}`,
    severity: evalResult.apoptoticTriggered ? 'critical' : 'info',
    payload: { state, evalResult }
  });

  return {
    success: true,
    agentId,
    dissonanceLevel: state.dissonanceLevel,
    harmony: evalResult.harmony,
    isApoptotic: state.isApoptotic,
    apoptoticTriggered: evalResult.apoptoticTriggered,
    currentBudget: state.currentBudget,
    maxDissonanceThreshold: state.maxDissonanceThreshold
  };
}

/**
 * Enregistre un evenement Eureka pour l'agent (reduit la dissonance de 50%).
 */
async function conscienceEureka(context = {}) {
  const agentConscience = require('../agentConscienceService');
  const db = await getDatabase();
  const agentId = context.targetId || context.agentId || 'strategy_agent';
  const state = await agentConscience.loadConscienceState(db, agentId);

  agentConscience.triggerEureka(state);
  try {
    await agentConscience.persistConscienceState(db, agentId, state, { reason: 'primitive_eureka' });
  } catch (_) {}

  telemetry.emitEvent({
    eventType: 'COGNITIVE_EUREKA',
    agentId,
    action: 'EUREKA',
    detail: `Eureka moment registered! Dissonance halved to ${state.dissonanceLevel.toFixed(1)}.`,
    severity: 'info',
    payload: { state }
  });

  return {
    success: true,
    agentId,
    dissonanceLevel: state.dissonanceLevel,
    eurekaMoments: state.eurekaMoments,
    currentBudget: state.currentBudget
  };
}

module.exports = {
  conscienceEvaluate,
  conscienceEureka
};
