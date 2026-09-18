const DIRECTIONS = Object.freeze(['allow', 'inhibit', 'amplify', 'delay', 'block', 'require_evidence']);
const MAX_FEEDBACK_CYCLES = 3;

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

function axis(id, score, evidence) {
  return { id, score: clampUnit(score), basis: score > 0 ? 'proxy' : 'unobserved', evidence };
}

function presenceScore(value, scores) {
  return value ? scores.present : scores.absent;
}

function listLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function socialScore(workers) {
  if (workers > 1) return 0.8;
  if (workers === 1) return 0.5;
  return 0.2;
}

function ecologyScore(workers) {
  return workers > 1 ? 0.4 : 0.2;
}

function physicalScore(profile) {
  const highRisk = profile.risk === 'high' || profile.type === 'security';
  return highRisk ? 0.5 : 0.3;
}

function convergenceMatrix(state, plan, signals) {
  const profile = state.profile;
  const workers = state.selectedWorkers;
  const selfModel = plan.selfModel || {};
  const recall = plan.autobiographicalRecall || {};
  const recalledEpisodes = listLength(recall.episodes);
  const hasEvidenceGate = signals.some((signal) => signal.source === 'evidence');
  const axes = [
    axis('situatedness', presenceScore(Object.keys(profile).length, { present: 0.5, absent: 0.2 }), [`profile_fields=${Object.keys(profile).length}`]),
    axis('autobiography', presenceScore(recalledEpisodes, { present: 0.8, absent: 0 }), [`recalled_episodes=${recalledEpisodes}`]),
    axis('self_model', presenceScore(selfModel.decisionPolicy, { present: 0.8, absent: 0 }), [`self_model=${Boolean(selfModel.decisionPolicy)}`]),
    axis('embodiment', 0.6, ['budget_sensor', 'worker_actuator', 'execution_feedback']),
    axis('homeostasis', presenceScore(state.survival.constraints, { present: 0.8, absent: 0.3 }), state.pressures),
    axis('social_cognition', socialScore(workers), [`selected_workers=${workers}`]),
    axis('ecological_resilience', ecologyScore(workers), [`worker_diversity_candidates=${workers}`]),
    axis('physical_grounding', physicalScore(profile), [`risk=${profile.risk || 'unknown'}`, `tokens=${state.tokens}`]),
    axis('evidence_discipline', presenceScore(hasEvidenceGate, { present: 1, absent: 0 }), state.missingEvidencePhases.map((phase) => phase.key))
  ];
  const score = axes.reduce((total, item) => total + item.score, 0) / axes.length;
  return { schema: 'genos.convergence-matrix/v1alpha1', score: Number(score.toFixed(3)), axes };
}

function scoreSignals(signals) {
  return signals.reduce((score, signal) => {
    if (signal.direction === 'amplify' || signal.direction === 'allow') return score + signal.strength;
    if (signal.direction === 'inhibit' || signal.direction === 'delay') return score - signal.strength;
    return score;
  }, 0);
}

function actionModeFor(state, vetoes) {
  const executionBlocked = vetoes.some((signal) => signal.target === 'action_plan' || signal.target === 'worker_fanout');
  if (executionBlocked) return 'blocked';
  const uncertain = clampUnit(state.profile.uncertainty) >= 0.6;
  const highRisk = state.profile.risk === 'high' || state.profile.type === 'security';
  return uncertain || highRisk ? 'probe' : 'execute';
}

function arbitrate(signals, state) {
  const vetoes = signals.filter((signal) => signal.direction === 'block');
  const requiredEvidence = signals.filter((signal) => signal.direction === 'require_evidence');
  const uncertain = clampUnit(state.profile.uncertainty) >= 0.6;
  const highRisk = state.profile.risk === 'high' || state.profile.type === 'security';
  const actionMode = actionModeFor(state, vetoes);
  return {
    status: vetoes.length ? 'blocked' : 'regulated',
    actionMode,
    reversibleOnly: actionMode !== 'execute',
    humanReviewRequired: highRisk && uncertain,
    priority: ['safety', 'evidence', 'budget', 'speed', 'exploration'],
    actionScore: Number(scoreSignals(signals).toFixed(3)),
    vetoes,
    requiredEvidence,
    selectedCorrections: signals.filter((signal) => ['block', 'inhibit', 'amplify', 'require_evidence'].includes(signal.direction))
  };
}

function nonNegativeNumber(value) {
  const resolved = Number(value);
  return Number.isFinite(resolved) && resolved >= 0 ? resolved : null;
}

function normalizeControlFeedback(feedback = {}) {
  const errors = Array.isArray(feedback.errors) ? feedback.errors : [];
  return {
    exitCode: Number.isFinite(Number(feedback.exitCode)) ? Number(feedback.exitCode) : null,
    evidenceScore: feedback.evidenceScore === undefined ? null : clampUnit(feedback.evidenceScore),
    replayVerified: feedback.replayVerified === undefined ? null : Boolean(feedback.replayVerified),
    durationMs: nonNegativeNumber(feedback.durationMs),
    tokensUsed: nonNegativeNumber(feedback.tokensUsed),
    workerOutcomes: Array.isArray(feedback.workerOutcomes) ? feedback.workerOutcomes : [],
    promotionStatus: feedback.promotionStatus || null,
    errors
  };
}

function failedFeedbackSignal(feedback) {
  const failed = feedback.exitCode !== null && feedback.exitCode !== 0;
  if (!failed && feedback.errors.length === 0) return null;
  return controlSignal({ source: 'feedback', target: 'action_plan', direction: 'block', strength: 1, reason: 'execution feedback reported a failure', evidence: feedback.errors, ttl: 1 });
}

function tokenFeedbackSignal(feedback, worldState) {
  if (feedback.tokensUsed === null || feedback.tokensUsed <= worldState.tokens) return null;
  return controlSignal({ source: 'feedback', target: 'worker_fanout', direction: 'inhibit', strength: 1, reason: 'execution consumed more tokens than the regulated reserve', evidence: [`tokensUsed=${feedback.tokensUsed}`, `tokens=${worldState.tokens}`], ttl: 1 });
}

function evidenceFeedbackSignal(feedback) {
  if (feedback.evidenceScore === null || feedback.evidenceScore >= 0.8) return null;
  return controlSignal({ source: 'feedback', target: 'promotion', direction: 'block', strength: 1, reason: 'execution feedback did not reach the evidence threshold', evidence: [`evidenceScore=${feedback.evidenceScore}`], ttl: 1 });
}

function replayFeedbackSignal(feedback) {
  if (feedback.replayVerified !== false) return null;
  return controlSignal({ source: 'feedback', target: 'promotion', direction: 'require_evidence', strength: 1, reason: 'replay verification is still missing after execution', evidence: ['replayVerified=false'], ttl: 1 });
}

function successFeedbackSignal(feedback) {
  if (feedback.exitCode !== 0 || feedback.errors.length > 0) return null;
  return controlSignal({ source: 'feedback', target: 'action_plan', direction: 'allow', strength: 0.5, reason: 'execution feedback completed without reported errors', evidence: ['exitCode=0'], ttl: 1 });
}

function feedbackSignals(feedback, worldState) {
  return [
    failedFeedbackSignal(feedback), tokenFeedbackSignal(feedback, worldState),
    evidenceFeedbackSignal(feedback), replayFeedbackSignal(feedback), successFeedbackSignal(feedback)
  ].filter(Boolean);
}

function applyControlFeedback(regulation, rawFeedback = {}) {
  const feedback = normalizeControlFeedback(rawFeedback);
  const previous = regulation || {};
  const worldState = previous.worldState || { profile: {}, tokens: 0, pressures: [] };
  const signals = [...(previous.signals || []), ...feedbackSignals(feedback, worldState)];
  const priorCycles = Number(previous.feedbackCycles || 0);
  if (priorCycles >= MAX_FEEDBACK_CYCLES) {
    signals.push(controlSignal({
      source: 'feedback', target: 'action_plan', direction: 'block', strength: 1,
      reason: 'maximum feedback arbitration cycles reached', evidence: [`feedbackCycles=${priorCycles}`], ttl: 1
    }));
  }
  return {
    ...previous,
    signals,
    feedback,
    feedbackCycles: Math.min(MAX_FEEDBACK_CYCLES, priorCycles + 1),
    arbitration: arbitrate(signals, worldState),
    expectedFeedback: previous.expectedFeedback || ['exitCode', 'evidenceScore', 'replayVerified', 'durationMs', 'tokensUsed']
  };
}

function regulateAutonomyPlan(contract, budget, plan) {
  const worldState = buildWorldState(contract, budget, plan);
  const regulators = regulatorResults(worldState);
  const signals = regulators.flatMap((result) => result.signals);
  return {
    schema: 'genos.control-regulation/v1alpha1',
    worldState,
    convergence: convergenceMatrix(worldState, plan, signals),
    regulators,
    signals,
    arbitration: arbitrate(signals, worldState),
    expectedFeedback: ['exitCode', 'evidenceScore', 'replayVerified', 'durationMs', 'tokensUsed']
  };
}

module.exports = { applyControlFeedback, controlSignal, normalizeControlFeedback, regulateAutonomyPlan };
