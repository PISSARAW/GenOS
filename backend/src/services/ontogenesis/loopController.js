'use strict';

/**
 * Boucle Observer → planifier → sélectionner → exécuter → vérifier →
 * intégrer → réévaluer (ADR 0235). Pure : décide l'événement machine
 * et les effets à appliquer, sans E/S. L'appelant persiste, notifie
 * et dispatche. Effets : chaînes 'notify-<kind>:<raison>' et
 * 'bump-attempt', 'record-failure', 'create-resolution-task'.
 */

function controlEvent(controlMode) {
  if (controlMode === 'paused') return 'paused';
  if (controlMode === 'stopping' || controlMode === 'stopped') return 'stopped';
  return null;
}

function stepInitializing() {
  return { event: 'planned', effects: [] };
}

function stepPlanning(snapshot) {
  if (!snapshot.budgetsOk) return waitBlocked('budgets-epuises');
  if (snapshot.memoryLevel === 'constrained') return { hold: true, reason: 'ressources-contraintes' };
  if (snapshot.selection && snapshot.selection.task) return { event: 'dispatch', effects: [] };
  if (selectionBlocked(snapshot) === 'backlog-vide') return { event: 'idle', effects: [] };
  return waitDecision(selectionBlocked(snapshot));
}

function selectionBlocked(snapshot) {
  return (snapshot.selection && snapshot.selection.blocked) || 'backlog-vide';
}

function waitBlocked(reason) {
  return { event: 'wait', effects: [`notify-blocked:${reason}`] };
}

function waitDecision(reason) {
  return { event: 'wait', effects: [`notify-decision_needed:${reason}`] };
}

function stepExecuting(snapshot) {
  if (!snapshot.workerResult) return { hold: true, reason: 'attente-worker' };
  if (snapshot.workerResult === 'resource') return { event: 'resource', effects: [] };
  return { event: 'finished', effects: [] };
}

function stepVerifying(snapshot) {
  if (snapshot.proofsOk) return { event: 'passed', effects: [] };
  return { event: 'failed', effects: ['bump-attempt', 'record-failure'] };
}

function stepIntegrating(snapshot) {
  if (snapshot.integration === 'committed') return { event: 'integrated', effects: ['notify-result:integre'] };
  if (snapshot.integration === 'conflict') {
    return { event: 'wait', effects: ['notify-decision_needed:conflit', 'create-resolution-task'] };
  }
  return waitBlocked('integration-rejetee');
}

function stepHolding(snapshot) {
  return { hold: true, reason: `attente-${snapshot.state.toLowerCase()}` };
}

const HANDLERS = {
  INITIALIZING: stepInitializing,
  PLANNING: stepPlanning,
  EXECUTING: stepExecuting,
  VERIFYING: stepVerifying,
  INTEGRATING: stepIntegrating,
  SLEEPING_RESOURCE: stepHolding,
  WAITING_INPUT: stepHolding,
  IDLE: stepHolding,
  PAUSED: stepHolding,
  STOPPING: stepHolding,
  STOPPED: stepHolding
};

function stepByState(snapshot) {
  const handler = HANDLERS[snapshot.state];
  if (!handler) return { hold: true, reason: 'etat-inconnu' };
  return handler(snapshot);
}

function stepLoop(snapshot) {
  const override = controlEvent(snapshot.controlMode);
  if (override) return { event: override, effects: [] };
  if (snapshot.memoryLevel === 'critical') return { event: 'resource', effects: [] };
  return stepByState(snapshot);
}

module.exports = { stepLoop };
