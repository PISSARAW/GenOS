const fundamentals = require('./fundamentals');
const evolution = require('./evolution');

async function plan(context = {}) {
  const rawSteps = context.steps || context.plan || context.actions;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return { success: false, error: 'A non-empty steps array is required.', code: 'PLAN_STEPS_REQUIRED' };
  }
  const steps = rawSteps.map((step, index) => {
    const item = typeof step === 'string' ? { action: step } : step || {};
    return {
      id: String(item.id || `step-${index + 1}`),
      order: index + 1,
      action: String(item.action || item.name || '').trim(),
      objective: String(item.objective || item.description || '').trim(),
      dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map(String) : []
    };
  });
  const invalid = steps.filter((step) => !step.action);
  if (invalid.length) return { success: false, error: 'Every plan step requires an action.', code: 'PLAN_STEP_INVALID' };
  const ids = new Set(steps.map((step) => step.id));
  const missingDependencies = steps.flatMap((step) => step.dependsOn.filter((dependency) => !ids.has(dependency)));
  if (missingDependencies.length) return { success: false, error: `Unknown plan dependencies: ${[...new Set(missingDependencies)].join(', ')}`, code: 'PLAN_DEPENDENCY_INVALID' };
  return { success: true, plan: { id: String(context.planId || `plan-${Date.now()}`), steps, stepCount: steps.length } };
}

async function roleForks(context = {}) {
  const roles = Array.isArray(context.roles) ? context.roles.map(String).map((role) => role.trim()).filter(Boolean) : [];
  const orchestratorId = context.orchestratorId || context.agentId;
  if (!orchestratorId || !roles.length) return { success: false, error: 'orchestratorId and roles are required.', code: 'ROLE_FORK_INPUT_REQUIRED' };
  const workers = [];
  for (const role of roles) {
    const result = await fundamentals.fork({
      ...context,
      orchestratorId,
      role,
      mission: context.missions?.[role] || context.mission || `Independent ${role} review`
    });
    if (!result.success) return { success: false, error: `Role fork '${role}' failed: ${result.error}`, workers };
    workers.push({ role, ...result });
  }
  return { success: true, workers, workerCount: workers.length };
}

async function commonProbes(context = {}) {
  const probes = Array.isArray(context.probes) ? context.probes : [
    { id: 'syntax', kind: 'verify', description: 'Check syntax or compilation.' },
    { id: 'tests', kind: 'verify', description: 'Run the focused regression tests.' },
    { id: 'state', kind: 'evidence', description: 'Inspect the persisted state and relevant logs.' }
  ];
  const normalized = probes.map((probe, index) => ({
    id: String(probe?.id || `probe-${index + 1}`),
    kind: String(probe?.kind || 'evidence'),
    description: String(probe?.description || probe?.action || '').trim()
  })).filter((probe) => probe.description);
  if (!normalized.length) return { success: false, error: 'At least one probe description is required.', code: 'PROBES_REQUIRED' };
  return { success: true, probes: normalized, count: normalized.length, executable: normalized.every((probe) => probe.kind !== 'command' || Boolean(context.workspaceId)) };
}

async function evidence(context = {}) {
  const items = context.evidence || context.receipts || context.results;
  if (!Array.isArray(items) || !items.length) return { success: false, error: 'Non-empty evidence is required.', code: 'EVIDENCE_REQUIRED' };
  const normalized = items.filter(Boolean).map((item, index) => ({
    id: String(item.id || `evidence-${index + 1}`),
    kind: String(item.kind || item.type || 'observation'),
    value: item.value ?? item.output ?? item.detail ?? item
  }));
  return { success: true, evidence: normalized, evidenceCount: normalized.length };
}

async function conditionalMutation(context = {}) {
  const evidenceResult = await evidence({ evidence: context.evidence || context.receipts || [] });
  if (!evidenceResult.success) return evidenceResult;
  const threshold = Number(context.minEvidence ?? 1);
  if (!Number.isInteger(threshold) || threshold < 1) return { success: false, error: 'minEvidence must be a positive integer.', code: 'MUTATION_THRESHOLD_INVALID' };
  if (evidenceResult.evidenceCount < threshold) return { success: false, skipped: true, error: 'Evidence threshold was not met.', evidenceCount: evidenceResult.evidenceCount, required: threshold };
  const result = await evolution.mutate({ ...context, evidence: evidenceResult.evidence });
  return { ...result, evidence: evidenceResult.evidence, conditional: true };
}

async function beliefUpdate(context = {}) {
  const hypotheses = Array.isArray(context.hypotheses) ? context.hypotheses : [];
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  if (!hypotheses.length) return { success: false, error: 'hypotheses are required.', code: 'HYPOTHESES_REQUIRED' };
  const updates = hypotheses.map((hypothesis) => {
    const prior = Math.min(1, Math.max(0, Number(hypothesis.confidence ?? hypothesis.probability ?? 0.5)));
    const related = evidence.filter((item) => String(item.hypothesisId || item.targetHypothesisId || '') === String(hypothesis.id));
    const refutations = related.filter((item) => item.falsifies === true || item.refutes === true).length;
    const confirmations = related.filter((item) => item.confirms === true || item.supports === true).length;
    const posterior = Math.min(1, Math.max(0, prior + confirmations * 0.15 - refutations * 0.25));
    return { ...hypothesis, prior, posterior, evidenceCount: related.length, falsified: posterior === 0 };
  });
  return { success: true, hypotheses: updates, best: [...updates].sort((left, right) => right.posterior - left.posterior)[0] };
}

async function expectedInformationGain(context = {}) {
  const probes = Array.isArray(context.probes) ? context.probes : [];
  if (!probes.length) return { success: false, error: 'probes are required.', code: 'PROBES_REQUIRED' };
  const scored = probes.map((probe, index) => {
    const outcomes = Array.isArray(probe.outcomes) ? probe.outcomes : [];
    const probabilities = outcomes.map((outcome) => Number(outcome.probability)).filter((value) => Number.isFinite(value) && value > 0);
    const entropy = probabilities.reduce((sum, probability) => sum - probability * Math.log2(probability), 0);
    return { ...probe, id: String(probe.id || `probe-${index + 1}`), expectedInformationGain: Number(entropy.toFixed(6)) };
  }).sort((left, right) => right.expectedInformationGain - left.expectedInformationGain || left.id.localeCompare(right.id));
  return { success: true, probes: scored, best: scored[0] };
}

async function nextProbe(context = {}) {
  const result = await expectedInformationGain(context);
  if (!result.success) return result;
  return { success: true, selectedProbe: result.best, candidates: result.probes };
}

async function analyzeTrajectory(context = {}) {
  const actions = context.actionHistory || context.actions || context.trajectory;
  if (!Array.isArray(actions) || !actions.length) return { success: false, error: 'actionHistory is required.', code: 'ACTION_HISTORY_REQUIRED' };
  const counts = new Map();
  for (const action of actions) {
    const key = String(typeof action === 'string' ? action : action.action || action.tool || action.type || 'unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, count]) => count > 1).sort((left, right) => right[1] - left[1]);
  return { success: true, sampleSize: actions.length, uniqueActions: counts.size, repeatedActions: repeated, repetitionRate: Number((1 - counts.size / actions.length).toFixed(6)), loopDetected: repeated.length > 0 && (1 - counts.size / actions.length) >= Number(context.threshold ?? 0.5) };
}

module.exports = { plan, roleForks, commonProbes, evidence, conditionalMutation, beliefUpdate, expectedInformationGain, nextProbe, analyzeTrajectory };
