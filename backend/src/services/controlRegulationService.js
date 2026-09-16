const DIRECTIONS = Object.freeze(['allow', 'inhibit', 'amplify', 'delay', 'block', 'require_evidence']);

function clampUnit(value) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return 0;
  return Math.max(0, Math.min(1, resolved));
}

function controlSignal(input) {
  const direction = DIRECTIONS.includes(input.direction) ? input.direction : 'allow';
  return {
    source: input.source,
    target: input.target,
    direction,
    strength: clampUnit(input.strength),
    reason: input.reason,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    ttl: Number.isFinite(Number(input.ttl)) ? Number(input.ttl) : 1,
    cost: Number.isFinite(Number(input.cost)) ? Number(input.cost) : 0
  };
}

function tokenTotal(tokenPolicy, budget) {
  return Number(tokenPolicy.total || budget.tokens || 0);
}

function minimumWorkerTokens(tokenPolicy, budget) {
  return Number(tokenPolicy.minimumWorkerTokens || budget.minimumWorkerTokens || 0);
}

function workerCount(plan, key, fallback) {
  return Number(plan[key]?.requestedBranches || plan[key]?.selectedWorkers || fallback?.length || 0);
}

function missingEvidencePhases(plan) {
  return (plan.omittedPhases || []).filter((phase) => phase.key === 'replay_and_promote' || phase.key === 'evidence_and_evaluation');
}

function buildWorldState(contract, budget, plan) {
  const profile = contract.problem_profile || {};
  const tokenPolicy = plan.tokenPolicy || {};
  const survival = plan.survival || {};
  return {
    profile,
    survival,
    tokens: tokenTotal(tokenPolicy, budget),
    minimumWorkerTokens: minimumWorkerTokens(tokenPolicy, budget),
    requestedWorkers: workerCount(plan, 'exploration', plan.workers),
    selectedWorkers: workerCount(plan, 'dispatchDecision', plan.dispatchWorkers),
    missingEvidencePhases: missingEvidencePhases(plan),
    pressures: survival.pressures || []
  };
}

function reflexSignals(state) {
  if (state.survival.constraints?.suspend) {
    return [controlSignal({
      source: 'reflex', target: 'worker_fanout', direction: 'block', strength: 1,
      reason: 'survival dormancy is active', evidence: state.pressures, ttl: 1
    })];
  }
  return [controlSignal({
    source: 'reflex', target: 'action_plan', direction: 'allow', strength: 0.7,
    reason: 'no immediate survival veto was detected', evidence: ['survival.constraints.suspend=false'], ttl: 1
  })];
}

function homeostasisSignals(state) {
  const reservePressure = state.minimumWorkerTokens > 0 && state.tokens < state.minimumWorkerTokens ? 0.9 : 0;
  const survivalPressure = state.pressures.includes('starvation') ? 0.75 : 0;
  const strength = Math.max(reservePressure, survivalPressure);
  if (strength === 0) {
    return [controlSignal({
      source: 'homeostasis', target: 'worker_fanout', direction: 'allow', strength: 0.55,
      reason: 'token reserve can fund the selected plan', evidence: [`tokens=${state.tokens}`], ttl: 1
    })];
  }
  return [controlSignal({
    source: 'homeostasis', target: 'worker_fanout', direction: 'inhibit', strength,
    reason: 'budget pressure requires a lower worker fan-out', evidence: [`tokens=${state.tokens}`, `minimumWorkerTokens=${state.minimumWorkerTokens}`], ttl: 1
  })];
}

function evidenceSignals(state) {
  if (state.missingEvidencePhases.length) {
    return [controlSignal({
      source: 'evidence', target: 'promotion', direction: 'block', strength: 1,
      reason: 'promotion phases are unavailable in the selected strategy portfolio', evidence: state.missingEvidencePhases.map((phase) => phase.key), ttl: 1
    })];
  }
  return [controlSignal({
    source: 'evidence', target: 'promotion', direction: 'require_evidence', strength: 0.82,
    reason: 'promotion remains gated by replay and recorded decision evidence', evidence: ['replay_and_promote'], ttl: 1
  })];
}

function attentionSignals(state) {
  const uncertainty = clampUnit(state.profile.uncertainty);
  const target = uncertainty >= 0.6 ? 'diagnostics' : 'action_plan';
  return [controlSignal({
    source: 'attention', target, direction: 'amplify', strength: Math.max(0.55, uncertainty),
    reason: uncertainty >= 0.6 ? 'uncertainty makes targeted diagnostics discriminating' : 'mission can proceed with ordinary context focus',
    evidence: [`uncertainty=${uncertainty}`], ttl: 1
  })];
}

function immuneSignals(state) {
  const highRisk = state.profile.risk === 'high' || state.profile.type === 'security';
  if (highRisk) {
    return [controlSignal({
      source: 'immune', target: 'mutation', direction: 'require_evidence', strength: 0.88,
      reason: 'high-risk or security work needs replayable evidence before mutation', evidence: [`risk=${state.profile.risk || 'unknown'}`, `type=${state.profile.type || 'unknown'}`], ttl: 1
    })];
  }
  return [controlSignal({
    source: 'immune', target: 'mutation', direction: 'allow', strength: 0.6,
    reason: 'risk profile does not require an immune veto', evidence: [`risk=${state.profile.risk || 'unknown'}`], ttl: 1
  })];
}

function regulatorResults(state) {
  return [
    { loop: 'reflex', variable: 'survival_veto', signals: reflexSignals(state) },
    { loop: 'homeostasis', variable: 'budget_tokens', signals: homeostasisSignals(state) },
    { loop: 'evidence', variable: 'evidence_score', signals: evidenceSignals(state) },
    { loop: 'attention', variable: 'salience', signals: attentionSignals(state) },
    { loop: 'immune', variable: 'blast_radius', signals: immuneSignals(state) }
  ];
}

function scoreSignals(signals) {
  return signals.reduce((score, signal) => {
    if (signal.direction === 'amplify' || signal.direction === 'allow') return score + signal.strength;
    if (signal.direction === 'inhibit' || signal.direction === 'delay') return score - signal.strength;
    return score;
  }, 0);
}

function arbitrate(signals) {
  const vetoes = signals.filter((signal) => signal.direction === 'block');
  const requiredEvidence = signals.filter((signal) => signal.direction === 'require_evidence');
  return {
    status: vetoes.length ? 'blocked' : 'regulated',
    priority: ['safety', 'evidence', 'budget', 'speed', 'exploration'],
    actionScore: Number(scoreSignals(signals).toFixed(3)),
    vetoes,
    requiredEvidence,
    selectedCorrections: signals.filter((signal) => ['block', 'inhibit', 'amplify', 'require_evidence'].includes(signal.direction))
  };
}

function regulateAutonomyPlan(contract, budget, plan) {
  const worldState = buildWorldState(contract, budget, plan);
  const regulators = regulatorResults(worldState);
  const signals = regulators.flatMap((result) => result.signals);
  return {
    schema: 'genos.control-regulation/v1alpha1',
    worldState,
    regulators,
    signals,
    arbitration: arbitrate(signals),
    expectedFeedback: ['exitCode', 'evidenceScore', 'replayVerified', 'durationMs', 'tokensUsed']
  };
}

module.exports = { controlSignal, regulateAutonomyPlan };