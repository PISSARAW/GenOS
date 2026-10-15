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

const modelProvider = require('./modelProvider');
const localModelDiscovery = require('./localModelDiscovery');
const telemetry = require('./telemetryObserver');
const { capabilitiesSatisfy, normalizeCapabilities } = require('./modelCapabilities');
const routingPolicy = require('./modelRoutingPolicy');
const attemptLedger = require('./modelAttemptLedger');
const budgetReservations = require('./modelBudgetReservationService');
const parallelBudget = require('./modelParallelBudgetService');
const lateReceipts = require('./modelLateReceiptService');
function isLocalUri(uri) {
  return routingPolicy.isLocalUri(uri);
}

function estimateCostUsd(quote, inputTokens, outputTokens) {
  return routingPolicy.estimateCostUsd(quote, inputTokens, outputTokens);
}

function responseScore(result) {
  return routingPolicy.responseScore(result);
}

const { recordModelUsage } = attemptLedger;
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
  if (ctx.maxCostUsd != null && !registered && !isLocalUri(uri)) throw Object.assign(new Error('Remote model price is unknown under a cost budget.'), { code: 'MODEL_COST_QUOTE_UNAVAILABLE' });
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
  if (ctx.maxTokens === 0) throw Object.assign(new Error('Model output token budget is zero.'), { code: 'MODEL_TOKEN_BUDGET_EXCEEDED' });
  const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  const inputTokens = modelProvider.estimateTokenCount(promptText);
  const outputTokens = floorPositive(ctx.maxTokens, 2048);
  const estimated = estimateCostUsd(quoteOf(registered), inputTokens, outputTokens);
  if (ctx.maxCostUsd != null && estimated > remainingBudget(ctx)) throw Object.assign(new Error(`Estimated model cost ${estimated} exceeds remaining budget ${remainingBudget(ctx)}.`), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
  return { costUsd: estimated, tokens: inputTokens + outputTokens };
}

function armAttempt(ctx, attemptTimeout) {
  let deadlineExpired = false;
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const controller = new AbortController();
  const abortAttempt = () => {
    controller.abort();
    rejectDeadline(Object.assign(new Error('Model route aborted.'), { code: 'MODEL_ROUTE_ABORTED' }));
  };
  if (ctx.signal && ctx.signal.aborted) abortAttempt();
  else if (ctx.signal) ctx.signal.addEventListener('abort', abortAttempt, { once: true });
  const timer = setTimeout(() => { deadlineExpired = true; controller.abort();
    rejectDeadline(Object.assign(new Error('Model route deadline exceeded.'), { code: 'MODEL_ROUTE_DEADLINE_EXCEEDED' }));
  }, Math.max(1, attemptTimeout));
  return {
    controller,
    deadline,
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

async function invokeProvider(ctx, outcome) {
  const { prepared, uri } = outcome;
  const attemptTimeout = ctx.remainingMs();
  if (attemptTimeout <= 0) throw Object.assign(
    new Error('Model routing deadline exhausted before attempting provider ' + uri + '.'),
    { code: 'MODEL_ROUTE_DEADLINE_EXCEEDED' });
  const attempt = armAttempt(ctx, attemptTimeout);
  try {
    outcome.providerCalled = true;
    outcome.providerPromise = modelProvider.generate({
      model: uri,
      prompt: ctx.prompt,
      timeoutMs: attemptTimeout,
      maxTokens: ctx.maxTokens,
      endpoint: ctx.endpoint || prepared.endpoint,
      priority: ctx.priority,
      agentId: ctx.agentId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      seed: ctx.seed,
      stream: ctx.stream,
      responseFormat: ctx.responseFormat,
      providerContinuity: ctx.providerContinuity,
      enforceSchema: ctx.enforceSchema,
      signal: attempt.controller.signal,
      displayWidth: ctx.displayWidth,
      displayHeight: ctx.displayHeight,
      onToken: (token) => { prepared.bufferedTokens.push(token); }
    });
    return await Promise.race([outcome.providerPromise, attempt.deadline]);
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
  if (attemptLedger.usageFrom(result).tokenUsageSource === 'unknown') return null;
  return estimateCostUsd({ costInput: costOrZero(registered, 'cost_input'), costOutput: costOrZero(registered, 'cost_output') }, result.inputTokens, result.outputTokens);
}

function actualBudgetExceeded(ctx, costUsd, settlement) {
  if (settlement.overBudget) return true;
  return ctx.maxCostUsd != null && costUsd !== null
    && ctx.spent > Number(ctx.maxCostUsd);
}

async function finalizeAttempt(ctx, outcome, result) {
  const costUsd = actualCostUsd(outcome.prepared.registered, result);
  ctx.spent = (ctx.spent || 0) + (costUsd || 0);
  const usage = attemptLedger.usageFrom(result);
  const settlement = await budgetReservations.settle(ctx.db, outcome.reservation, {
    providerCalled: true, costUsd,
    tokens: usage.inputTokens === null ? null : usage.inputTokens + usage.outputTokens
  });
  const overBudget = actualBudgetExceeded(ctx, costUsd, settlement);
  const enriched = Object.assign({}, result, { model: outcome.uri, requestedModel: outcome.uri,
    servedModel: result.servedModel || result.model || outcome.prepared.modelName,
    routeAttemptId: outcome.id, latencyMs: Date.now() - outcome.startedAt, costUsd,
    attemptStatus: overBudget ? 'rejected_budget' : 'completed', providerCalled: true, catalogPricingKnown: attemptLedger.catalogPricingKnown(outcome) });
  await attemptLedger.finishAttempt(ctx.db, { ...outcome, ...usage, costUsd,
    status: enriched.attemptStatus });
  outcome.finished = true;
  await recordModelUsage(ctx.db, { organizationId: ctx.organizationId, projectId: ctx.projectId,
    executionRunId: ctx.executionRunId, agentId: ctx.agentId }, enriched);
  if (overBudget) throw Object.assign(new Error(`Actual model cost ${ctx.spent} exceeds budget ${ctx.maxCostUsd}.`), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
  const observation = { ctx, outcome, result, costUsd };
  await recordLlmAttempt(observation);
  return enriched;
}

async function recordLlmAttempt({ ctx, outcome, result, costUsd }) {
  try {
    await require('./shadowReplayService').recordAttempt(ctx.db, {
      uri: outcome.uri,
      success: result.success !== false,
      costUsd,
      latencyMs: Date.now() - outcome.startedAt,
      servedModel: result.servedModel || result.model || null
    });
  } catch (_) {}
}

async function attemptRoute(ctx, uri) {
  const outcome = { ...attemptLedger.attemptIdentity(ctx, uri), uri, startedAt: Date.now() };
  await attemptLedger.startAttempt(ctx.db, outcome);
  try {
    outcome.prepared = await prepareAttempt(ctx, uri);
    const quote = checkBudget(ctx, outcome.prepared.registered, ctx.prompt);
    outcome.estimatedCostUsd = quote.costUsd;
    outcome.reservation = await budgetReservations.reserve({ db: ctx.db, attempt: outcome,
      ctx, costUsd: quote.costUsd, tokens: quote.tokens });
    if (outcome.reservation?.duplicate) {
      outcome.reservation = null;
      throw Object.assign(new Error('Model attempt already owns a budget reservation.'),
        { code: 'MODEL_ATTEMPT_ALREADY_RESERVED' });
    }
    const result = await invokeProvider(ctx, outcome);
    return await finalizeAttempt(ctx, outcome, result);
  } catch (error) {
    if (!outcome.finished) {
      const costUsd = await attemptLedger.recordFailedAttempt({ ctx, outcome, error });
      const usage = attemptLedger.usageFrom(error.usage || error);
      const settlement = await budgetReservations.settle(ctx.db, outcome.reservation, {
        providerCalled: outcome.providerCalled, costUsd,
        tokens: usage.inputTokens === null ? null : usage.inputTokens + usage.outputTokens
      });
      lateReceipts.observe({ ctx, outcome, error, settlement });
      if (costUsd !== null && outcome.providerCalled) ctx.spent = (ctx.spent || 0) + costUsd;
    }
    throw error;
  }
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
  const planned = ctx.providerContinuity
    ? { candidates, bandit: null } : await applyBanditCanary(candidates, ctx);
  for (const uri of planned.candidates) {
    try {
      const result = await attemptRoute(ctx, uri);
      await emitBufferedTokens(result.bufferedTokens || [], ctx.onToken, uri);
      const route = { mode: 'fallback', selectedModel: uri, attempts };
      if (planned.bandit) route.bandit = planned.bandit;
      return Object.assign({}, withoutBufferedTokens(result), { route });
    } catch (error) {
      discoveryRefreshed = await noteFailure(ctx, { uri, error, attempts }, discoveryRefreshed);
    }
  }
  throw summarizeFailures(attempts);
}

function banditCanaryRate() {
  const rate = Number(process.env.GENOS_BANDIT_CANARY);
  if (!Number.isFinite(rate)) return 0;
  return Math.max(0, Math.min(1, rate));
}

async function applyBanditCanary(candidates, ctx) {
  try {
    const bandit = require('./routingBanditService');
    const decided = await bandit.chooseWithGuardrails(ctx.db, candidates, {
      canaryKey: ctx.executionRunId || ctx.agentId || 'default',
      canaryRate: banditCanaryRate(),
      minPulls: 5,
      explicitRoute: ctx.explicitRoute || null,
      context: { promptTokens: Math.ceil(Buffer.byteLength(String(ctx.prompt || ''), 'utf8') / 4) }
    });
    const info = decided.mode === 'bandit' ? { choice: decided.choice, reason: decided.reason } : null;
    if (info) {
      telemetry.emitEvent({ eventType: 'MODEL_ROUTE_BANDIT_CANARY', agentId: ctx.agentId || 'model-router', action: 'CANARY', detail: `Bandit canary tries ${info.choice} first (${info.reason}).`, severity: 'info', payload: { choice: info.choice, reason: info.reason, candidates } });
    }
    return { candidates: decided.ordering, bandit: info };
  } catch (_) {
    return { candidates, bandit: null };
  }
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
  await parallelBudget.requireCapacity(candidates, ctx);
  const settled = await Promise.allSettled(candidates.map((uri) => attemptRoute(ctx, uri)));
  const successes = collectSuccesses(settled);
  if (!successes.length) throw summarizeParallelFailures(settled, candidates);
  return selectParallelResult({ successes, settled, candidates }, ctx);
}

module.exports = { attemptRoute, runFallback, runParallel, recordModelUsage, emitBufferedTokens };
