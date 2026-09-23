'use strict';

const hostIdentity = require('./hostRuntimeIdentityService');

const perfByModel = new Map();

function clampNumber(input, lower, upper) {
  const value = Number(input);
  if (!Number.isFinite(value)) return lower;
  if (value < lower) return lower;
  if (value > upper) return upper;
  return value;
}

function clamp01(input) {
  return clampNumber(input, 0, 1);
}

function safeInput(input) {
  if (input === undefined) return {};
  if (input === null) return {};
  if (typeof input !== 'object') return {};
  return input;
}

function textField(source, key, fallback) {
  const value = source[key];
  if (typeof value === 'string') return value;
  if (value === undefined) return fallback;
  if (value === null) return fallback;
  return String(value);
}

function arrayField(source, key) {
  const value = source[key];
  if (Array.isArray(value)) return value.slice();
  return [];
}

function recordPerformance(input) {
  const source = safeInput(input);
  const model = textField(source, 'model', 'unknown');
  const success = source.success === true ? 1 : 0;
  const prev = storedPerf(model);
  const samples = prev.samples + 1;
  const successRate = (prev.successRate * prev.samples + success) / samples;
  perfByModel.set(model, { samples, successRate });
  return { model, samples, successRate };
}

function storedPerf(model) {
  const found = perfByModel.get(model);
  if (found === undefined) return { samples: 0, successRate: 0.5 };
  return found;
}

function historicalBoost(model) {
  const entry = perfByModel.get(String(model));
  if (entry === undefined) return 0;
  return clamp01(entry.successRate - 0.5);
}

function nativeBonus(candidate, host) {
  if (candidate === host.nativeModel) return 0.2;
  if (candidate === host.host) return 0.2;
  return 0;
}

function privacyBonus(candidate, task) {
  if (task.privacy === 'high') return startsWith(candidate, 'ollama://', 0.15);
  return 0;
}

function latencyBonus(candidate, task) {
  if (task.latencyBudget === 'low') return startsWith(candidate, 'ollama://', 0.1);
  return 0;
}

function startsWith(candidate, prefix, bonus) {
  if (candidate.indexOf(prefix) === 0) return bonus;
  return 0;
}

function costPenalty(task) {
  const cost = Number(task.costBudget);
  if (Number.isFinite(cost) === false) return 0;
  if (cost <= 0) return 0.1;
  return 0;
}

function scoreCandidate(input) {
  const source = safeInput(input);
  const candidate = textField(source, 'candidate', '');
  const task = safeInput(source.task);
  const host = safeInput(source.host);
  const base = 0.5 + historicalBoost(candidate) + nativeBonus(candidate, host);
  const adjusted = base + privacyBonus(candidate, task) + latencyBonus(candidate, task);
  return clamp01(adjusted - costPenalty(task));
}

function scoredEntries(available, task, host) {
  return available.map(toScored);
  function toScored(candidate) {
    return { candidate, score: scoreCandidate({ candidate, task, host }) };
  }
}

function sortByScore(entries) {
  return entries.slice().sort(compareScore);
}

function compareScore(left, right) {
  return right.score - left.score;
}

function nativeEntryFirst(ordered, host, available) {
  if (available.indexOf(host.nativeModel) < 0) return ordered;
  const rest = ordered.filter(notNative);
  return [{ candidate: host.nativeModel, score: 1 }].concat(rest);
  function notNative(entry) {
    return entry.candidate !== host.nativeModel;
  }
}

function pickOrdered(input) {
  const source = safeInput(input);
  const ordered = sortByScore(scoredEntries(source.available, source.task, source.host));
  if (source.preferNative === true) return nativeEntryFirst(ordered, source.host, source.available);
  return ordered;
}

function originFor(picked, host) {
  if (picked === null) return 'deterministic';
  if (picked.candidate === host.nativeModel) return 'native';
  return 'delegated';
}

function reasonFor(preferNative) {
  if (preferNative === true) return 'native-first unless policy/request demands delegation';
  return 'delegation requested or allowed with measurable reason';
}

function fallbackList(ordered) {
  return ordered.slice(1, 4).map(pickCandidate);
}

function pickCandidate(entry) {
  return entry.candidate;
}

function resolveSubstrate(input) {
  const source = safeInput(input);
  const task = safeInput(source.task);
  const host = safeInput(source.host);
  const available = arrayField(source, 'availableModels');
  const requested = nullableRequested(source, task);
  const preferNative = hostIdentity.nativeFirstAllowed({ host, policy: safeInput(source.policy) });
  const ordered = pickOrdered({ available, task, host, preferNative });
  const picked = firstEntry(ordered);
  return {
    substrate: substrateName(picked),
    model: modelName(picked),
    origin: originFor(picked, host),
    reason: reasonFor(preferNative),
    expectedCapability: capabilityFor(picked),
    expectedCost: 0.5,
    expectedLatency: 0.5,
    fallbacks: fallbackList(ordered),
    evidenceRequirements: ['leases', 'evidence-gate', 'provenance'],
    requestedModel: requested,
    servedModel: modelName(picked)
  };
}

function nullableRequested(source, task) {
  const direct = source.requestedModel;
  if (direct === undefined) return nullableTaskRequested(task);
  if (direct === null) return null;
  return String(direct);
}

function nullableTaskRequested(task) {
  if (task.requestedModel === undefined) return null;
  if (task.requestedModel === null) return null;
  return String(task.requestedModel);
}

function firstEntry(ordered) {
  if (ordered.length === 0) return null;
  return ordered[0];
}

function substrateName(picked) {
  if (picked === null) return 'deterministic-procedure';
  return picked.candidate;
}

function modelName(picked) {
  if (picked === null) return null;
  return picked.candidate;
}

function capabilityFor(picked) {
  if (picked === null) return 0.3;
  return clamp01(picked.score);
}

function clearPerf() {
  perfByModel.clear();
}

module.exports = {
  resolveSubstrate,
  recordPerformance,
  clearPerf
};
