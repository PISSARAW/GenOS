'use strict';

const { performance } = require('node:perf_hooks');
const { isDeepStrictEqual } = require('node:util');

function invalid(reason, objectId) { return { status: 'blocked', reason, objectId: objectId || null }; }
function numeric(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

function costOf(result, started) {
  const bytes = numeric(result.bytes, Buffer.byteLength(JSON.stringify(result.value ?? null), 'utf8'));
  const tokens = numeric(result.tokens, Math.ceil(bytes / 4));
  const latencyMs = Math.max(0, performance.now() - started);
  return { bytes, tokens, tokensEstimated: result.tokens == null, latencyMs, total: tokens + latencyMs / 10 };
}

async function permitted(state, request) {
  try { return await state.authorize(request) === true; } catch (_) { return false; }
}

function remember(state, request, resolved) {
  const page = { id: request.objectId, value: resolved.value, revision: resolved.revision,
    sessionId: request.sessionId, scope: request.scope ?? null, cost: resolved.cost };
  return state.workingSet.pageIn(page);
}

function account(state, cost) {
  for (const key of ['bytes', 'tokens', 'latencyMs', 'total']) state.metrics.cost[key] += cost[key];
}

async function materialize(state, request) {
  const started = performance.now();
  const resolver = state.resolvers.get(request.reference || request.objectId);
  if (!resolver) return invalid('mmu_resolver_missing', request.objectId);
  const resolved = await resolver({ ...request, reference: request.reference || request.objectId });
  if (!resolved || resolved.value === undefined) return invalid('mmu_object_unresolved', request.objectId);
  // Permissions can change while an asynchronous resolver is running.
  if (!await permitted(state, request)) return invalid('mmu_permission_denied', request.objectId);
  const visibility = await state.ledger.materialize({ ...request, value: resolved.value });
  const cost = costOf(resolved, started);
  const loaded = remember(state, request, { ...resolved, cost, revision: visibility.revision });
  account(state, cost);
  if (loaded.status !== 'ready') return invalid('mmu_working_set_rejected', request.objectId);
  return { status: 'page_in', objectId: request.objectId, page: loaded.page, visibility, cost };
}

async function pageIn(state, request) {
  state.metrics.pageIns += 1;
  if (!state.workingSet || !state.ledger || !request.objectId) return invalid('mmu_dependencies_missing', request.objectId);
  if (!await permitted(state, request)) {
    state.metrics.denied += 1;
    return invalid('mmu_permission_denied', request.objectId);
  }
  try {
    const result = await materialize(state, request);
    if (result.status === 'blocked') state.metrics.failures += 1;
    return result;
  } catch (error) {
    state.metrics.failures += 1;
    return { ...invalid('mmu_page_in_failed', request.objectId), error: error.message };
  }
}

async function cached(state, request) {
  const current = state.workingSet?.need(request.objectId);
  if (current?.status !== 'ready' || !state.ledger?.visible) return null;
  const page = current.page;
  if (page.sessionId !== request.sessionId || page.scope !== (request.scope ?? null)) return null;
  const visible = await state.ledger.visible(request);
  if (!visible.visible || visible.revision !== page.revision) return null;
  if (!isDeepStrictEqual(visible.value, page.value)) return null;
  return { ...current, source: 'working_set' };
}

async function need(state, request) {
  if (!await permitted(state, request)) {
    state.metrics.denied += 1;
    return invalid('mmu_permission_denied', request.objectId);
  }
  try {
    const hit = await cached(state, request);
    if (hit) return hit;
  } catch (error) {
    return { ...invalid('mmu_visibility_failed', request.objectId), error: error.message };
  }
  state.workingSet?.pageOut(request.objectId);
  state.metrics.pageFaults += 1;
  return pageIn(state, request);
}

function shouldPrefetch(state, candidate) {
  const utility = numeric(candidate.probability) * numeric(candidate.valueOfInformation, 1);
  return utility / Math.max(numeric(candidate.estimatedTokens, 1), 1) >= state.threshold;
}

async function prefetch(state, candidates) {
  const selected = candidates.filter((candidate) => shouldPrefetch(state, candidate));
  const results = [];
  for (const candidate of selected) {
    const result = await need(state, candidate);
    if (result.status === 'page_in') state.metrics.prefetched += 1;
    results.push(result);
  }
  return { status: 'ready', selected: selected.map((candidate) => candidate.objectId), results,
    skipped: candidates.filter((candidate) => !shouldPrefetch(state, candidate)).map((candidate) => candidate.objectId) };
}

function createMmu(input = {}) {
  const state = { workingSet: input.workingSet, ledger: input.ledger,
    resolvers: new Map(Object.entries(input.resolvers || {})), authorize: input.authorize || (() => false),
    threshold: numeric(input.prefetchThreshold, 1), metrics: { pageIns: 0, pageFaults: 0, denied: 0,
      failures: 0, prefetched: 0, cost: { bytes: 0, tokens: 0, latencyMs: 0, total: 0 } } };
  function register(reference, resolver) {
    if (!reference || typeof resolver !== 'function') throw new Error('mmu_resolver_invalid');
    state.resolvers.set(reference, resolver);
  }
  return { register, pageIn: (request = {}) => pageIn(state, request),
    need: (request = {}) => need(state, request), prefetch: (candidates = []) => prefetch(state, candidates),
    metrics: () => ({ ...state.metrics, cost: { ...state.metrics.cost } }) };
}

module.exports = { createMmu };
