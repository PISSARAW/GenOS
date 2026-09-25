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

  const harmony = Math.max(0, Math.min(100, Math.round(
    ((state.maxDissonanceThreshold - state.dissonanceLevel) / state.maxDissonanceThreshold) * 100
  )));

  telemetry.emitEvent({
    eventType: 'CONSCIENCE_STATE_READ',
    agentId,
    action: 'READ',
    detail: `Conscience state: dissonance=${state.dissonanceLevel.toFixed(1)}, harmony=${harmony}%, apoptotic=${state.isApoptotic}`,
    severity: 'info',
    payload: { state }
  });

  return {
    success: true,
    agentId,
    dissonanceLevel: state.dissonanceLevel,
    harmony,
    isApoptotic: state.isApoptotic,
    apoptoticTriggered: false,
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

  const granted = false;

  telemetry.emitEvent({
    eventType: 'COGNITIVE_EUREKA_WITHHELD',
    agentId,
    action: 'EUREKA_WITHHELD',
    detail: 'Eureka reward withheld: only supervisor-validated evidence can grant it.',
    severity: 'info',
    payload: { state }
  });

  return {
    success: true,
    agentId,
    dissonanceLevel: state.dissonanceLevel,
    eurekaMoments: state.eurekaMoments,
    eurekaGranted: granted,
    reason: 'supervisor_evidence_required',
    currentBudget: state.currentBudget
  };
}

module.exports = {
  conscienceEvaluate,
  conscienceEureka
};
