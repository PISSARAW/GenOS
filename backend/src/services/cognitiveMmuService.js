'use strict';

const { performance } = require('node:perf_hooks');

function invalid(reason, objectId) {
  return { status: 'blocked', reason, objectId: objectId || null };
}

function numeric(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function costOf(result, elapsedMs) {
  const bytes = numeric(result.bytes, Buffer.byteLength(JSON.stringify(result.value || null), 'utf8'));
  const tokens = numeric(result.tokens, Math.ceil(bytes / 4));
  return { bytes, tokens, latencyMs: Math.max(0, elapsedMs), total: tokens + elapsedMs / 10 };
}

function createMmu(input = {}) {
  const workingSet = input.workingSet;
  const ledger = input.ledger;
  const resolvers = new Map(Object.entries(input.resolvers || {}));
  const authorize = input.authorize || (() => false);
  const threshold = numeric(input.prefetchThreshold, 1);
  const metrics = { pageIns: 0, pageFaults: 0, denied: 0, failures: 0, prefetched: 0, cost: { bytes: 0, tokens: 0, latencyMs: 0, total: 0 } };

  function register(reference, resolver) {
    if (!reference || typeof resolver !== 'function') throw new Error('mmu_resolver_invalid');
    resolvers.set(reference, resolver);
  }

  async function pageIn(inputPage = {}) {
    const started = performance.now();
    const objectId = inputPage.objectId;
    metrics.pageIns += 1;
    if (!workingSet || !ledger || !objectId) return invalid('mmu_dependencies_missing', objectId);
    if (!authorize({ objectId, scope: inputPage.scope, context: inputPage.context })) {
      metrics.denied += 1;
      return invalid('mmu_permission_denied', objectId);
    }
    const resolver = resolvers.get(inputPage.reference || objectId);
    if (!resolver) { metrics.failures += 1; return invalid('mmu_resolver_missing', objectId); }
    try {
      const resolved = await resolver({ objectId, reference: inputPage.reference || objectId,
        context: inputPage.context || {} });
      if (!resolved || resolved.value === undefined) { metrics.failures += 1; return invalid('mmu_object_unresolved', objectId); }
      const cost = costOf(resolved, performance.now() - started);
      const visible = await ledger.materialize({ sessionId: inputPage.sessionId,
        objectId, value: resolved.value, scope: inputPage.scope, expiresAt: inputPage.expiresAt });
      const loaded = workingSet.pageIn({ id: objectId, value: resolved.value, cost, revision: visible.revision });
      metrics.cost.bytes += cost.bytes; metrics.cost.tokens += cost.tokens;
      metrics.cost.latencyMs += cost.latencyMs; metrics.cost.total += cost.total;
      if (loaded.status !== 'ready') { metrics.failures += 1; return invalid('mmu_working_set_rejected', objectId); }
      return { status: 'page_in', objectId, page: loaded.page, visibility: visible, cost };
    } catch (error) {
      metrics.failures += 1;
      return { ...invalid('mmu_page_in_failed', objectId), error: error.message };
    }
  }

  async function need(inputNeed = {}) {
    const objectId = inputNeed.objectId;
    const current = workingSet?.need(objectId);
    if (current?.status === 'ready') return { status: 'ready', source: 'working_set', ...current };
    metrics.pageFaults += 1;
    return pageIn(inputNeed);
  }

  function shouldPrefetch(candidate = {}) {
    const utility = numeric(candidate.probability) * numeric(candidate.valueOfInformation, 1);
    const cost = Math.max(numeric(candidate.estimatedTokens, 1), 1);
    return utility / cost >= threshold;
  }

  async function prefetch(candidates = []) {
    const selected = candidates.filter(shouldPrefetch);
    const results = [];
    for (const candidate of selected) {
      const result = await pageIn({ ...candidate, prefetch: true });
      if (result.status === 'page_in') metrics.prefetched += 1;
      results.push(result);
    }
    return { status: 'ready', selected: selected.map((candidate) => candidate.objectId), results,
      skipped: candidates.filter((candidate) => !shouldPrefetch(candidate)).map((candidate) => candidate.objectId) };
  }

  return { register, pageIn, need, prefetch, metrics: () => ({ ...metrics, cost: { ...metrics.cost } }) };
}

module.exports = { createMmu };
