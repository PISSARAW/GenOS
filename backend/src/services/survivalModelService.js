const PRESSURES = Object.freeze({
  starvation: 'starvation',
  infection: 'infection',
  injury: 'injury',
  predation: 'predation',
  overgrowth: 'overgrowth',
  isolation: 'isolation',
  conflict: 'conflict',
  senescence: 'senescence',
  habitatLoss: 'habitat_loss',
  stagnation: 'stagnation'
});

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function deriveSurvivalState(input = {}) {
  const budget = Math.max(0, Number(input.budget ?? input.tokens ?? 0));
  const energy = clamp01(input.energy, clamp01(budget / 12000));
  const threatLevel = clamp01(input.threatLevel, input.threat === true ? 1 : input.threat);
  const recentFailures = Math.max(0, Number(input.recentFailures || 0));
  const uncertainty = clamp01(input.uncertainty, input.uncertain === true ? 1 : 0);
  const memoryNoise = clamp01(input.memoryNoise);
  const socialConflict = clamp01(input.socialConflict);
  const stagnation = clamp01(input.stagnation);
  const isolation = clamp01(input.isolation);
  const habitatLoss = clamp01(input.habitatLoss);
  const activeWorkers = Math.max(0, Number(input.activeWorkers || 0));
  const carryingCapacity = Math.max(1, Number(input.carryingCapacity || 8));
  const independentlyValidated = input.independentlyValidated === true;
  const integrity = clamp01(input.integrity, 1 - Math.max(threatLevel, clamp01(recentFailures / 4)));
  const coherence = clamp01(input.coherence, 1 - Math.max(uncertainty * 0.6, memoryNoise));
  const adaptability = clamp01(input.adaptability, 0.5);
  const reproductionPotential = clamp01(input.reproductionPotential);
  const toxicity = clamp01(input.toxicity, Math.max(threatLevel * 0.5, memoryNoise * 0.6));
  const viability = clamp01((energy + integrity + coherence + adaptability + (1 - toxicity)) / 5);
  return {
    viability, energy, integrity, coherence, adaptability,
    memoryHealth: clamp01(1 - memoryNoise), reproductionPotential,
    threatLevel, toxicity, uncertainty, socialConflict, stagnation, isolation,
    habitatLoss, activeWorkers, carryingCapacity, independentlyValidated,
    stress: clamp01(input.stress, Math.max(1 - energy, uncertainty, threatLevel))
  };
}

const PRESSURE_RULES = Object.freeze([
  [PRESSURES.starvation, (state) => state.energy < 0.25],
  [PRESSURES.infection, (state) => state.toxicity >= 0.7],
  [PRESSURES.injury, (state) => state.integrity < 0.55],
  [PRESSURES.predation, (state) => state.threatLevel >= 0.7],
  [PRESSURES.overgrowth, (state) => state.activeWorkers > state.carryingCapacity],
  [PRESSURES.isolation, (state) => state.isolation >= 0.7],
  [PRESSURES.conflict, (state) => state.socialConflict >= 0.65],
  [PRESSURES.senescence, (state) => state.memoryHealth < 0.5],
  [PRESSURES.habitatLoss, (state) => state.habitatLoss >= 0.7],
  [PRESSURES.stagnation, (state) => state.stagnation >= 0.7]
]);

function detectPressures(state) {
  return PRESSURE_RULES.filter(([, matches]) => matches(state)).map(([pressure]) => pressure);
}

function tightenFanout(constraints, limit) {
  constraints.maxWorkerFanout = constraints.maxWorkerFanout === null
    ? limit
    : Math.min(constraints.maxWorkerFanout, limit);
}

function applyEnergyPolicy(state, pressures, policy) {
  if (pressures.includes(PRESSURES.starvation)) {
    policy.actions.push('conserve_energy', 'prefer_low_cost_tools', 'delay_nonessential_tasks');
    policy.constraints.preferLowCostTools = true;
    tightenFanout(policy.constraints, state.uncertainty >= 0.7 ? 2 : 1);
  }
  if (state.energy < 0.08) {
    policy.actions.push('hibernate');
    policy.constraints.maxWorkerFanout = 0;
    policy.constraints.suspend = true;
  }
}

function applyThreatPolicy(pressures, policy) {
  if (pressures.includes(PRESSURES.infection) || pressures.includes(PRESSURES.predation)) {
    policy.actions.push('quarantine', 'request_human_review');
    policy.constraints.requireIndependentEvidence = true;
  }
  if (pressures.includes(PRESSURES.conflict)) policy.constraints.requireIndependentEvidence = true;
}

function applyEcologyPolicy(state, pressures, policy) {
  if (pressures.includes(PRESSURES.overgrowth)) tightenFanout(policy.constraints, state.carryingCapacity);
  if (pressures.includes(PRESSURES.isolation) && state.energy >= 0.25) policy.actions.push('spawn_helper');
}

function applyContinuityPolicy(pressures, policy) {
  if (pressures.includes(PRESSURES.injury)) policy.actions.push('repair_boundary');
  if (pressures.includes(PRESSURES.senescence)) policy.actions.push('prune_memory');
  if (pressures.includes(PRESSURES.habitatLoss)) {
    policy.actions.push('migrate_workspace', 'hibernate');
    tightenFanout(policy.constraints, 0);
    policy.constraints.suspend = true;
  }
  if (pressures.includes(PRESSURES.stagnation)) {
    policy.actions.push('controlled_mutation');
    policy.constraints.mutationBlastRadius = 1;
  }
}

function survivalPolicy(state, pressures = detectPressures(state)) {
  const policy = { actions: [], constraints: { maxWorkerFanout: null, preferLowCostTools: false, requireIndependentEvidence: false, mutationBlastRadius: null, suspend: false } };
  applyEnergyPolicy(state, pressures, policy);
  applyThreatPolicy(pressures, policy);
  applyEcologyPolicy(state, pressures, policy);
  applyContinuityPolicy(pressures, policy);
  if (state.reproductionPotential >= 0.8 && state.coherence >= 0.8 && state.threatLevel < 0.25 && state.independentlyValidated) policy.actions.push('reproduce_strategy');
  return { pressures, actions: [...new Set(policy.actions)], constraints: policy.constraints };
}

function evaluateSurvival(input = {}) {
  const state = deriveSurvivalState(input);
  return { schema: 'genos.survival/v1alpha1', state, ...survivalPolicy(state) };
}

module.exports = { PRESSURES, deriveSurvivalState, detectPressures, survivalPolicy, evaluateSurvival };