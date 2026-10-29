'use strict';

const INPUT_FRAMING_RESERVE = 1024;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function reserveForCall(input) {
  const prompt = typeof input.prompt === 'string' ? input.prompt : JSON.stringify(input.prompt ?? '');
  const promptBytes = Buffer.byteLength(prompt || '', 'utf8');
  const maxTokens = Number.isSafeInteger(input.maxTokens) && input.maxTokens > 0 ? input.maxTokens : 128;
  return promptBytes + INPUT_FRAMING_RESERVE + maxTokens;
}

function measuredTokens(row) {
  return row?.measured === true && Number.isSafeInteger(row.inputTokens) && row.inputTokens >= 0
    && Number.isSafeInteger(row.outputTokens) && row.outputTokens >= 0
    ? row.inputTokens + row.outputTokens : null;
}

function assertPending(state, reservation) {
  if (!state.pending || reservation?.sequence !== state.pending.sequence) {
    throw codedError('ETT_CAMPAIGN_BUDGET_RESERVATION_INVALID', 'Provider call has no matching budget reservation.');
  }
}

function persistResponse(state, values) {
  try { state.options.onResponse?.(responseRecord(values)); }
  catch (error) { state.stopReason = 'usage_journal_persistence_failed'; throw error; }
}

function responseRecord({ reservation, row, tokens, error }) {
  return { ...reservation, measured: tokens !== null, tokens,
    inputTokens: Number.isSafeInteger(row.inputTokens) ? row.inputTokens : null,
    outputTokens: Number.isSafeInteger(row.outputTokens) ? row.outputTokens : null,
    model: row.model || null, provider: row.provider || null,
    elapsedMs: Number.isFinite(row.elapsedMs) ? row.elapsedMs : null, error: error || null };
}

function beginCall(state, input) {
  if (state.stopReason) throw codedError('ETT_CAMPAIGN_BUDGET_STOPPED', `Campaign stopped: ${state.stopReason}`);
  if (state.pending) throw codedError('ETT_CAMPAIGN_BUDGET_CALL_PENDING', 'A provider call is already pending.');
  const reservedTokens = reserveForCall(input);
  if (state.used + reservedTokens > state.options.tokenBudget) {
    state.stopReason = 'token_budget_reserve_reached';
    throw codedError('ETT_CAMPAIGN_TOKEN_BUDGET_EXHAUSTED',
      `Provider call reserve (${reservedTokens}) exceeds remaining campaign budget (${state.options.tokenBudget - state.used}).`);
  }
  state.pending = { sequence: ++state.sequence, reservedTokens,
    context: { ...state.context, ...(input.callContext || {}) } };
  try { state.options.onDispatch?.(state.pending); }
  catch (error) { state.stopReason = 'usage_journal_persistence_failed'; throw error; }
  return state.pending;
}

function completeCall(state, values) {
  const { reservation, row } = values;
  assertPending(state, reservation);
  const tokens = measuredTokens(row);
  if (tokens === null) {
    state.stopReason = 'provider_usage_unmeasured';
    persistResponse(state, { reservation, row, tokens, error: 'unmeasured provider response' });
    state.pending = null;
    throw codedError('ETT_PROVIDER_USAGE_UNMEASURED',
      'Provider usage is missing or invalid; the campaign stopped before another call.');
  }
  if (tokens > reservation.reservedTokens || state.used + tokens > state.options.tokenBudget) {
    state.stopReason = 'provider_usage_exceeded_reservation';
    persistResponse(state, { reservation, row, tokens, error: 'measured usage exceeded reservation' });
    state.pending = null;
    state.used += tokens;
    throw codedError('ETT_CAMPAIGN_TOKEN_BUDGET_VIOLATION',
      'Measured provider usage exceeded the pre-dispatch campaign reserve.');
  }
  persistResponse(state, { reservation, row, tokens });
  state.pending = null;
  state.used += tokens;
  return tokens;
}

function failCall(state, reservation, error) {
  assertPending(state, reservation);
  state.stopReason = 'provider_call_usage_unknown';
  persistResponse(state, { reservation, row: {}, tokens: null,
    error: String(error?.code || error?.message || error).slice(0, 300) });
  state.pending = null;
}

function createCampaignBudgetGuard(options) {
  const state = { options, used: options.initialTokens || 0,
    sequence: options.initialSequence || 0, stopReason: null, pending: null, context: {} };
  return { beginCall: (input) => beginCall(state, input),
    completeCall: (reservation, row) => completeCall(state, { reservation, row }),
    failCall: (reservation, error) => failCall(state, reservation, error),
    setContext: (value) => { state.context = { ...(value || {}) }; },
    get usedTokens() { return state.used; }, get stopReason() { return state.stopReason; },
    get pendingCall() { return state.pending; }, get nextSequence() { return state.sequence + 1; } };
}

module.exports = { INPUT_FRAMING_RESERVE, reserveForCall, measuredTokens,
  createCampaignBudgetGuard };
