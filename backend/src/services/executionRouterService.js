'use strict';

const MODES = ['primitive', 'procedure', 'single_worker', 'adaptive_worker',
  'specialists', 'collective', 'large_search'];

function tryArithmeticPrimitive(text) {
  if (!/^[0-9+\-*/().\s^%]+$/.test(text)) return null;
  if (!/[0-9]/.test(text) || text.length > 64) return null;
  try {
    const sanitized = text.replace(/\^/g, '**');
    const value = Function(`"use strict"; return (${sanitized})`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return { value, receipt: `deterministic-eval:${sanitized}=${value}` };
  } catch (_) {
    return null;
  }
}

function baseModeForClass(cls) {
  if (cls === 'deterministic_trivial') return 'primitive';
  if (cls === 'mechanical_transform' || cls === 'factual_stable') return 'procedure';
  if (cls === 'hard_combinatorial') return 'large_search';
  if (hasAny(cls, ['full_project', 'large_mission'])) return 'collective';
  if (hasAny(cls, ['security_audit', 'unknown_bug', 'feature_options'])) return 'specialists';
  if (hasAny(cls, ['repo_understanding', 'standard_algorithmic'])) return 'adaptive_worker';
  return 'single_worker';
}

function hasAny(cls, needles) {
  return needles.some((n) => cls.includes(n));
}

function escalateForProfile(base, profile) {
  let idx = MODES.indexOf(base);
  if (profile.complexity.decomposition_needed) idx = Math.max(idx, 2);
  if (profile.complexity.parallelism_value >= 3) idx = Math.max(idx, 5);
  if (profile.complexity.solver_value >= 3) idx = MODES.indexOf('large_search');
  if (profile.verification.independent_review_needed) idx = Math.max(idx, 4);
  if (profile.action.risk === 'high') idx = Math.max(idx, 3);
  return MODES[Math.min(idx, MODES.length - 1)];
}

function chooseExecutionPath(profile) {
  const cls = profile.request_class || 'factual_stable';
  const base = baseModeForClass(cls);
  const mode = escalateForProfile(base, profile);
  return { mode, requestClass: cls, reason: reasonFor(mode, cls), ladder: MODES };
}

function reasonFor(mode, cls) {
  return `minimal-sufficient: class=${cls} -> ${mode} (escalate only on evidence)`;
}

function needsOrchestration(mode) {
  return mode !== 'primitive' && mode !== 'procedure';
}

module.exports = {
  MODES,
  tryArithmeticPrimitive,
  chooseExecutionPath,
  needsOrchestration,
};
