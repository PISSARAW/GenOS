'use strict';
const { fail } = require('./qualityContract');
function validUsage(usage) { return usage && [usage.inputTokens, usage.outputTokens].every(value => Number.isInteger(value) && value >= 0); }
function assertAvailable(contract, budget) {
  if (budget.calls >= contract.maxCalls) throw fail('GQEL_CALL_BUDGET', 'Call budget exhausted.');
  if (budget.tokens >= contract.budgetMaxTokens) throw fail('GQEL_TOKEN_BUDGET', 'Token budget exhausted.');
  if (Date.now() - budget.startedAt >= contract.maxDurationMs) throw fail('GQEL_TIME_BUDGET', 'Time budget exhausted.');
}
function reservation(contract, request) {
  const prompt = String(request.prompt || '');
  if (prompt.length > contract.maxPromptChars) throw fail('GQEL_CONTEXT_OVERFLOW', 'Full context exceeds the configured limit; nothing was silently truncated.');
  const outputLimit = Math.min(request.maxOutputTokens || contract.maxOutputTokens, contract.maxOutputTokens);
  if (!Number.isInteger(outputLimit) || outputLimit < 1) throw fail('GQEL_INVALID_OUTPUT_LIMIT', 'Invalid output cap.');
  // Byte count is a conservative preflight reservation, not measured usage.
  return { prompt, outputLimit, reserved: Buffer.byteLength(prompt + JSON.stringify(request.responseSchema || ''), 'utf8') + outputLimit };
}
async function timedCall(callback, request, timeoutMs) {
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(fail('GQEL_CALL_TIMEOUT', 'Call timed out.')); }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => callback({ ...request, signal: controller.signal })), timeout]); }
  finally { clearTimeout(timer); }
}
function accountReply(reply, budget, limits) {
  if (!validUsage(reply?.usage)) throw fail('GQEL_USAGE_UNVERIFIED', 'Adapter must report inputTokens and outputTokens; text alone is not a metered reply.');
  budget.tokens += reply.usage.inputTokens + reply.usage.outputTokens;
  if (reply.usage.outputTokens > limits.outputLimit) throw fail('GQEL_OUTPUT_CAP_EXCEEDED', 'Adapter exceeded the authorized output cap.');
  if (budget.tokens > limits.contract.budgetMaxTokens) throw fail('GQEL_TOKEN_BUDGET', 'Provider usage exceeded the reservation; stop without promotion.');
  if (['length', 'max_tokens', 'num_predict'].includes(reply.finishReason)) throw fail('GQEL_TRUNCATED_OUTPUT', 'Truncated output cannot be accepted.');
  if (reply.content === undefined) throw fail('GQEL_EMPTY_REPLY', 'Adapter reply has no content.');
}
function recordReply(receipt, reply) {
  receipt.usage = reply?.usage || null; receipt.finishReason = reply?.finishReason || null; receipt.model = reply?.model || null;
}
function assertModel(reply, expectedModel) {
  if (expectedModel && reply?.model !== expectedModel) throw fail('GQEL_MODEL_MISMATCH', 'Observed reviewer model differs from its configured identity.');
}
function createInvoker(contract, session) {
  return async (callback, request) => {
    if (typeof callback !== 'function') throw fail('GQEL_ADAPTER_MISSING', `Missing adapter for ${request.operation}.`);
    const budget = session.budget;
    assertAvailable(contract, budget);
    const limits = reservation(contract, request);
    if (budget.tokens + limits.reserved > contract.budgetMaxTokens) throw fail('GQEL_TOKEN_BUDGET', 'Insufficient budget for the next complete call.');
    budget.calls++;
    const before = budget.tokens, started = Date.now();
    const receipt = { call: budget.calls, operation: request.operation, stage: request.stage || 'review',
      protocolAttempt: request.protocolAttempt || 0, startedAt: started, status: 'pending' };
    session.calls.push(receipt);
    try {
      const reply = await timedCall(callback, { ...request, maxOutputTokens: limits.outputLimit },
        Math.min(contract.callTimeoutMs, contract.maxDurationMs - (Date.now() - budget.startedAt)));
      recordReply(receipt, reply);
      accountReply(reply, budget, { ...limits, contract }); assertModel(reply, request.expectedModel);
      receipt.status = 'completed';
      if (Date.now() - budget.startedAt >= contract.maxDurationMs) throw fail('GQEL_TIME_BUDGET', 'Deadline reached.');
      return reply.content;
    } catch (error) {
      if (budget.tokens === before) { budget.tokens += limits.reserved; budget.usageComplete = false; }
      receipt.status = 'failed'; receipt.error = error.code || 'GQEL_ADAPTER_FAILED'; throw error;
    } finally { receipt.elapsedMs = Date.now() - started; }
  };
}
module.exports = { createInvoker, assertAvailable, validUsage };
