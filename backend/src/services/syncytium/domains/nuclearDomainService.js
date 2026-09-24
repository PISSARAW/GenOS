'use strict';

function compile(input = []) {
  const entries = Array.isArray(input) ? input.map((domain) => [domain?.domainId, domain]) : Object.entries(input || {});
  const domains = {};
  for (const [key, definition] of entries) {
    const domainId = String(definition?.domainId || key || '').trim();
    if (!domainId || domains[domainId]) throw domainError(`Nuclear domain '${domainId}' is empty or duplicated.`);
    domains[domainId] = normalizeDomain(domainId, definition);
  }
  return domains;
}

function normalizeDomain(domainId, definition = {}) {
  return {
    domainId,
    members: normalizeList(definition.members),
    owns: normalizeList(definition.owns),
    mayRead: normalizeList(definition.mayRead),
    mayWrite: normalizeList(definition.mayWrite),
    mayPropose: normalizeList(definition.mayPropose),
    mayVeto: normalizeList(definition.mayVeto),
    subscriptions: normalizeList(definition.subscriptions),
    maxStalenessMs: normalizeBudget(definition.maxStalenessMs),
    stalenessBudgets: normalizeBudgetMap(definition.stalenessBudgets),
    localCachePolicy: definition.localCachePolicy || 'DEFAULT'
  };
}

function normalizeBudgetMap(budgets) {
  if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) return {};
  return Object.fromEntries(Object.entries(budgets).map(([path, value]) => [path, normalizeBudget(value)]));
}

function normalizeBudget(value) {
  if (value === undefined || value === null) return null;
  const budget = Number(value);
  if (!Number.isSafeInteger(budget) || budget < 0) throw domainError('Staleness budgets must be non-negative integers.');
  return budget;
}

function normalizeList(values) {
  return Array.isArray(values) ? [...new Set(values.map((value) => String(value).trim()).filter(Boolean))] : [];
}

function ownerFor(domains, path) {
  return Object.values(domains).find((domain) => matchesAny(domain.owns, path)) || null;
}

function matchesAny(patterns, path) {
  return patterns.some((pattern) => matchesPath(pattern, path));
}

function matchesPath(pattern, path) {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

function domainError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_DOMAIN_INVALID' });
}

module.exports = { compile, ownerFor, matchesAny };
