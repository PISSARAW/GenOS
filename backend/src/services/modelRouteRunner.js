/**
 * Model route execution — single-route attempts plus fallback/parallel
 * orchestration. Extracted from modelRouter so each step stays under the
 * complexity gate; modelRouter delegates here (fine delegation).
 *
 * A route context (`ctx`) carries every attempt input as one object:
 * { db, prompt, maxTokens, maxCostUsd, spent, priority, agentId,
 *   organizationId, projectId, seed, stream, signal, displayWidth,
 *   displayHeight, requiredCapabilities, onToken, remainingMs }.
 */

const crypto = require('crypto');
const modelProvider = require('./modelProvider');
const localModelDiscovery = require('./localModelDiscovery');
const telemetry = require('./telemetryObserver');
const { capabilitiesSatisfy, normalizeCapabilities } = require('./modelCapabilities');
const routingPolicy = require('./modelRoutingPolicy');

function isLocalUri(uri) {
  return routingPolicy.isLocalUri(uri);
}

function estimateCostUsd(quote, inputTokens, outputTokens) {
  return routingPolicy.estimateCostUsd(quote, inputTokens, outputTokens);
}

function responseScore(result) {
  return routingPolicy.responseScore(result);
}

async function recordModelUsage(db, scope, result) {
  if (!db || typeof db.run !== 'function' || !scope.organizationId || !scope.projectId) return;
  await db.run(
    'INSERT INTO usage_ledger(id, organization_id, project_id, release_id, category, quantity, cost_usd, metadata_json) VALUES(?,?,?,?,?,?,?,?)',
    `usage-model-${crypto.randomUUID()}`,
    scope.organizationId,
    scope.projectId,
    null,
    'model_inference',
    result.inputTokens + result.outputTokens,
    result.costUsd,
    JSON.stringify({ model: result.model, provider: result.provider, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs })
  );
}

async function emitBufferedTokens(tokens, onToken, model) {
  for (const token of tokens) await onToken(token, model);
}

function throwIfUnsupported(registered, required, uri) {
  let capabilities = [];
  try { capabilities = normalizeCapabilities(JSON.parse(registered.capabilities_json || '[]')); } catch (_) { /* unparseable capabilities mean no match */ }
  if (!capabilitiesSatisfy(capabilities, required)) throw Object.assign(new Error(`Model '${uri}' does not satisfy required capabilities: ${required.join(', ')}.`), { code: 'MODEL_CAPABILITY_MISMATCH' });
}

function checkCapabilities(registered, required, uri) {
  if (!required || required.length === 0 || !registered) return;
  throwIfUnsupported(registered, required, uri);
}

function discoveredMatches(discovered, uri) {
  return discovered.some((candidate) => candidate.uri === uri && candidate.chatCapable);
}

async function verifyLocalModelRefreshed(uri, registered) {
  const refreshed = await localModelDiscovery.discoverLocalModels({ force: true });
  if (!refreshed.length && !(registered && registered.endpoint)) throw new Error(`Local model '${uri}' could not be verified by discovery.`);
  if (refreshed.length && !discoveredMatches(refreshed, uri)) throw new Error(`Local model '${uri}' is not present in the current chat-capable discovery set.`);
}

async function verifyLocalModel(uri, registered) {
  if (registered && registered.endpoint) return;
  const discovered = await localModelDiscovery.discoverLocalModels();
  if (discoveredMatches(discovered, uri)) return;
  await verifyLocalModelRefreshed(uri, registered);
}

async function lookupRegistration(db, provider, modelName) {
  if (!db) return null;
  return db.get('SELECT endpoint, capabilities_json, cost_input, cost_output, latency_ms FROM provider_configs WHERE provider = ? AND model = ? AND enabled = 1', provider, modelName);
}

function resolveEndpoint(registered, uri) {
  if (registered && registered.endpoint) return registered.endpoint;
  return localModelDiscovery.endpointForModel(uri) || undefined;
}

async function prepareAttempt(ctx, uri) {
  const normalizedUri = modelProvider.configuredModel(uri);
  const [, provider, modelName] = normalizedUri.match(/^([\w-]+):\/\/(.+)$/);
  const registered = await lookupRegistration(ctx.db, provider, modelName);
  checkCapabilities(registered, ctx.requiredCapabilities, uri);
  if (isLocalUri(uri)) await verifyLocalModel(uri, registered);
  return { normalizedUri, provider, modelName, registered, endpoint: resolveEndpoint(registered, uri), bufferedTokens: [] };
}

function floorPositive(value, fallback) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Math.floor(Number(value));
  return fallback;
}

function remainingBudget(ctx) {
  return Number(ctx.maxCostUsd) - (ctx.spent || 0);
}

function quoteOf(registered) {
  return { costInput: registered && registered.cost_input, costOutput: registered && registered.cost_output };
}

function checkBudget(ctx, registered, prompt) {
  const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  const inputTokens = modelProvider.tokenize(promptText).length;
  const outputTokens = floorPositive(ctx.maxTokens, 2048);
  const estimated = estimateCostUsd(quoteOf(registered), inputTokens, outputTokens);
  if (ctx.maxCostUsd != null && estimated > remainingBudget(ctx)) throw Object.assign(new Error(`Estimated model cost ${estimated} exceeds remaining budget ${remainingBudget(ctx)}.`), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
  return estimated;
}

function armAttempt(ctx, attemptTimeout) {
  let deadlineExpired = false;
  const controller = new AbortController();
  const abortAttempt = () => controller.abort();
  if (ctx.signal && ctx.signal.aborted) abortAttempt();
  else if (ctx.signal) ctx.signal.addEventListener('abort', abortAttempt, { once: true });
  const timer = setTimeout(() => { deadlineExpired = true; controller.abort(); }, Math.max(1, attemptTimeout));
  return {
    controller,
    expired: () => deadlineExpired,
    release: () => releaseAttempt(ctx, timer, abortAttempt)
  };
}

function releaseAttempt(ctx, timer, abortAttempt) {
  clearTimeout(timer);
  if (ctx.signal) ctx.signal.removeEventListener('abort', abortAttempt);
}

function mapAttemptError(attempt, uri, error) {
  if (attempt.expired()) return Object.assign(new Error(`Model route '${uri}' exceeded its remaining deadline.`), { code: 'MODEL_ROUTE_DEADLINE_EXCEEDED' });
  return error;
}

async function invokeProvider(ctx, prepared, uri) {
  const attemptTimeout = ctx.remainingMs();
  if (attemptTimeout <= 0) throw new Error('Model routing deadline exhausted before attempting provider ' + uri + '.');
  checkBudget(ctx, prepared.registered, ctx.prompt);
  const attempt = armAttempt(ctx, attemptTimeout);
  try {
    return await modelProvider.generate({
      model: uri,
      prompt: ctx.prompt,
      timeoutMs: attemptTimeout,
      maxTokens: ctx.maxTokens,
      endpoint: prepared.endpoint,
      priority: ctx.priority,
      agentId: ctx.agentId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      seed: ctx.seed,
      stream: ctx.stream,
      signal: attempt.controller.signal,
      displayWidth: ctx.displayWidth,
      displayHeight: ctx.displayHeight,
      onToken: (token) => { prepared.bufferedTokens.push(token); }
    });
  } catch (error) {
    throw mapAttemptError(attempt, uri, error);
  } finally {
    attempt.release();
  }
}

function costOrZero(registered, key) {
  if (!registered) return 0;
  return Number(registered[key] || 0);
}

function actualCostUsd(registered, result) {
  return estimateCostUsd({ costInput: costOrZero(registered, 'cost_input'), costOutput: costOrZero(registered, 'cost_output') }, result.inputTokens, result.outputTokens);
}

async function finalizeAttempt(ctx, outcome, result) {
  const costUsd = actualCostUsd(outcome.prepared.registered, result);
  ctx.spent = (ctx.spent || 0) + costUsd;
  if (ctx.maxCostUsd != null && ctx.spent > Number(ctx.maxCostUsd)) throw Object.assign(new Error(`Actual model cost ${ctx.spent} exceeds budget ${ctx.maxCostUsd}.`), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
  const enriched = Object.assign({}, result, { model: outcome.uri, requestedModel: outcome.uri, servedModel: result.servedModel || result.model || outcome.prepared.modelName, latencyMs: Date.now() - outcome.startedAt, costUsd });
  await recordModelUsage(ctx.db, { organizationId: ctx.organizationId, projectId: ctx.projectId }, enriched);
  return enriched;
}

async function attemptRoute(ctx, uri) {
  const prepared = await prepareAttempt(ctx, uri);
  const outcome = { prepared, uri, startedAt: Date.now() };
  const result = await invokeProvider(ctx, prepared, uri);
  return finalizeAttempt(ctx, outcome, result);
}

function withoutBufferedTokens(result) {
  const output = Object.assign({}, result);
  delete output.bufferedTokens;
  return output;
}

async function noteFailure(ctx, record, refreshed) {
  record.attempts.push({ model: record.uri, status: 'failed', error: record.error.message, code: record.error.code });
  telemetry.emitEvent({
    eventType: 'MODEL_ROUTE_FAILED',
    agentId: ctx.agentId || 'model-router',
    action: 'MODEL_FALLBACK',
    detail: `Model route '${record.uri}' failed; trying the next candidate.`,
    severity: 'warning',
    payload: { model: record.uri, error: record.error.message, attempt: record.attempts.length, organizationId: ctx.organizationId, projectId: ctx.projectId }
  });
  if (isLocalUri(record.uri) && !refreshed) {
    refreshed = true;
    await localModelDiscovery.discoverLocalModels({ force: true });
  }
  return refreshed;
}

function summarizeFailures(attempts) {
  const lastAttempt = attempts[attempts.length - 1];
  const finalError = new Error(`Every model route failed. ${attempts.map((item) => `${item.model}: ${item.error}`).join('; ')}`);
  if (attempts.length > 0 && attempts.every((attempt) => attempt.code === 'MODEL_ROUTE_DEADLINE_EXCEEDED')) finalError.code = 'MODEL_ROUTE_DEADLINE_EXCEEDED';
  else if (lastAttempt && lastAttempt.code) finalError.code = lastAttempt.code;
  return finalError;
}

async function runFallback(candidates, ctx) {
  const attempts = [];
  let discoveryRefreshed = false;
  for (const uri of candidates) {
    try {
      const result = await attemptRoute(ctx, uri);
      await emitBufferedTokens(result.bufferedTokens || [], ctx.onToken, uri);
      return Object.assign({}, withoutBufferedTokens(result), { route: { mode: 'fallback', selectedModel: uri, attempts } });
    } catch (error) {
      discoveryRefreshed = await noteFailure(ctx, { uri, error, attempts }, discoveryRefreshed);
    }
  }
  throw summarizeFailures(attempts);
}

function requireParallelBudget(maxCostUsd) {
  if (maxCostUsd == null || !Number.isFinite(Number(maxCostUsd)) || Number(maxCostUsd) < 0) throw Object.assign(new Error('Parallel model review requires an explicit non-negative maxCostUsd budget.'), { code: 'MODEL_PARALLEL_BUDGET_REQUIRED' });
}

function collectSuccesses(settled) {
  const successes = [];
  for (let index = 0; index < settled.length; index += 1) {
    if (settled[index].status === 'fulfilled') successes.push(Object.assign({}, settled[index].value, { index }));
  }
  return successes;
}

function summarizeParallelFailures(settled, candidates) {
  const reasons = settled.map((result, index) => `${candidates[index]}: ${result.reason && result.reason.message ? result.reason.message : 'failed'}`).join('; ');
  return new Error(`Every parallel model route failed. ${reasons}`);
}

function sumCosts(successes) {
  return successes.reduce((sum, result) => sum + Number(result.costUsd || 0), 0);
}

function firstByScore(scored) {
  return [...scored].sort((left, right) => responseScore(right) - responseScore(left) || left.index - right.index)[0];
}

function firstByIndex(successes) {
  return [...successes].sort((left, right) => left.index - right.index)[0];
}

function pickScored(successes) {
  const scored = successes.filter((result) => responseScore(result) !== null);
  if (scored.length) return firstByScore(scored);
  return firstByIndex(successes);
}

function describeAttempts(outcome) {
  return outcome.settled.map((result, index) => ({ model: outcome.candidates[index], status: result.status, error: result.status === 'rejected' && result.reason ? result.reason.message : null }));
}

function stripReviews(successes) {
  return successes.map((entry) => {
    const output = Object.assign({}, entry);
    delete output.index;
    delete output.bufferedTokens;
    return output;
  });
}

async function selectParallelResult(outcome, ctx) {
  const parallelCostUsd = sumCosts(outcome.successes);
  if (ctx.maxCostUsd != null && parallelCostUsd > Number(ctx.maxCostUsd)) throw Object.assign(new Error(`Parallel model cost ${parallelCostUsd} exceeds budget ${ctx.maxCostUsd}.`), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
  const selected = pickScored(outcome.successes);
  await emitBufferedTokens(selected.bufferedTokens || [], ctx.onToken, selected.model);
  const output = withoutBufferedTokens(selected);
  delete output.index;
  return Object.assign({}, output, {
    route: { mode: 'parallel', selectedModel: selected.model, selectionScore: responseScore(selected), attempts: describeAttempts(outcome), reviews: stripReviews(outcome.successes) }
  });
}

async function runParallel(candidates, ctx) {
  requireParallelBudget(ctx.maxCostUsd);
  const settled = await Promise.allSettled(candidates.map((uri) => attemptRoute(ctx, uri)));
  const successes = collectSuccesses(settled);
  if (!successes.length) throw summarizeParallelFailures(settled, candidates);
  return selectParallelResult({ successes, settled, candidates }, ctx);
}

module.exports = { attemptRoute, runFallback, runParallel, recordModelUsage, emitBufferedTokens };
