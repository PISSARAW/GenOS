'use strict';

const { evaluate } = require('./allostaticObjectiveService');

const OBJECTIVES = [
  { id: 'energy', weight: 1, minimum: 0.2 },
  { id: 'integrity', weight: 1.5, minimum: 0.5 },
  { id: 'model_alignment', weight: 1, minimum: 0.4 },
  { id: 'context_capacity', weight: 0.5, minimum: 0.2 },
  { id: 'stress_tolerance', weight: 0.5, minimum: 0.2 }
];

function measuredObjectives(variables) {
  const state = variables || {};
  return OBJECTIVES.map((objective) => ({
    ...objective,
    value: objective.id === 'model_alignment'
      ? 1 - Number(state.model_drift || 0)
      : objective.id === 'context_capacity'
        ? 1 - Number(state.context_pressure || 0)
        : objective.id === 'stress_tolerance'
          ? 1 - Number(state.stress || 0)
          : Number(state[objective.id]) || 0
  }));
}

function selectedActions(variables, requestedWorkers) {
  const state = variables || {};
  const actions = [];
  if (Number(state.energy) < 0.3 || Number(state.context_pressure) >= 0.7 || Number(state.stress) >= 0.7) {
    if (Number(requestedWorkers) > 2) actions.push('reduce_worker_fanout');
  }
  if (Number(state.integrity) < 0.5 || Number(state.model_drift) >= 0.7) actions.push('require_evidence_before_mutation');
  return actions;
}

function applyActions(mission, actions) {
  if (!mission.executionPolicy) mission.executionPolicy = {};
  if (actions.includes('reduce_worker_fanout')) {
    const current = Number(mission.executionPolicy.workerFanoutLimit);
    mission.executionPolicy.workerFanoutLimit = Number.isFinite(current) ? Math.min(current, 2) : 2;
  }
  if (actions.includes('require_evidence_before_mutation')) {
    mission.executionPolicy.allowFileEdits = false;
    mission.requiresEvidenceBeforePromotion = true;
  }
}

function applyMeasuredPosture(mission, snapshot) {
  if (!mission || snapshot?.status !== 'measured' || !snapshot.variables) {
    return { status: 'insufficient_data', selectedActions: [], outcomePrediction: 'unavailable' };
  }
  const requestedWorkers = mission.executionPolicy?.requestedWorkers || mission.workerCount || 0;
  const objectives = measuredObjectives(snapshot.variables);
  const pressure = Math.max(0, Number(snapshot.variables.stress) || 0)
    + Math.max(0, Number(snapshot.variables.context_pressure) || 0);
  const evaluation = evaluate({ objectives, pressure });
  const actions = selectedActions(snapshot.variables, requestedWorkers);
  applyActions(mission, actions);
  return {
    status: 'measured',
    source: 'machine_interoception',
    objectives: evaluation.objectives,
    utility: evaluation.utility,
    violations: evaluation.violations,
    invariantSatisfied: evaluation.invariantSatisfied,
    selectedActions: actions,
    outcomePrediction: 'unavailable',
    limitation: 'State-conditioned policy selection; post-action viability has not been causally measured.'
  };
}

module.exports = { applyMeasuredPosture, measuredObjectives, selectedActions };
