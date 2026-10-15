const { terminateChild } = require('../src/services/processTermination');
const immune = require('../src/services/immuneSystem');
const agentConscience = require('../src/services/agentConscienceService');
const runtimeBudget = require('./runtime-budget-limit.cjs');
const MAX_RUNTIME_LINE_BYTES = 4 * 1024 * 1024;

function budgetLimit(state, key) {
  return runtimeBudget.budgetLimit(state.executionBudget, key);
}

function stopForBudget(state, info) {
  if (state.budgetStopped) return;
  state.budgetStopped = { dimension: info.dimension, observed: info.observed, limit: info.limit };
  state.emit({
    eventType: 'BUDGET_EXHAUSTED', action: 'BUDGET_GUARD',
    detail: `${info.dimension} budget exhausted during execution (${info.observed} > ${info.limit}).`,
    severity: 'warning', status: 'blocked', currentTask: 'Execution stopped by budget guard',
    payload: state.budgetStopped
  });
  try { state.child.stdout.pause(); } catch (_) {}
  try { state.child.stderr.pause(); } catch (_) {}
  setImmediate(() => {
    try {
      terminateChild(state.child);
    } catch (_) {
      try { state.child.kill('SIGTERM'); } catch (_) {}
    }
  });
}

function readUsage(event) {
  return event.usage || (event.payload || {}).usage || {};
}

function tokenCount(usage, key) {
  if (!Object.prototype.hasOwnProperty.call(usage, key)) return { present: false, value: 0 };
  const value = Number(usage[key]);
  return Number.isFinite(value) && value >= 0
    ? { present: true, value }
    : { present: true, value: null };
}

function cacheTokenCount(usage) {
  const key = Object.prototype.hasOwnProperty.call(usage, 'cached_input_tokens')
    ? 'cached_input_tokens' : 'cache_read_input_tokens';
  return tokenCount(usage, key);
}

function totalTokenCount(usage) {
  const key = Object.prototype.hasOwnProperty.call(usage, 'total_tokens') ? 'total_tokens' : 'tokens';
  return tokenCount(usage, key);
}

function hasUsableSplit(input, output, cached) {
  return input.present && input.value !== null && output.present && output.value !== null && cached.value !== null;
}

function fallbackTokenCount(total, fields) {
  if (total.present && total.value !== null) return total.value;
  return fields.some((field) => field.present) ? null : 0;
}

function billableTokenCount(usage) {
  const input = tokenCount(usage, 'input_tokens');
  const output = tokenCount(usage, 'output_tokens');
  const cached = cacheTokenCount(usage);
  const total = totalTokenCount(usage);
  if (!hasUsableSplit(input, output, cached)) return fallbackTokenCount(total, [input, output, cached, total]);
  return Math.max(0, input.value - Math.min(input.value, cached.value) + output.value);
}

function isAgentMessage(event) {
  return event.type === 'agent_message' || (event.item || {}).type === 'agent_message';
}

function messageText(event) {
  return String((event.item || {}).text || event.text || '');
}

function enforceBudget(state) {
  const observedTokens = state.exactTokens || state.estimatedTokens;
  if (state.tokenUsageUnknown) {
    stopForBudget(state, { dimension: 'tokens', observed: 'unknown', limit: budgetLimit(state, 'tokens') });
  } else if (observedTokens > budgetLimit(state, 'tokens')) {
    stopForBudget(state, { dimension: 'tokens', observed: observedTokens, limit: budgetLimit(state, 'tokens') });
  } else if (state.eventCount > budgetLimit(state, 'events')) {
    stopForBudget(state, { dimension: 'events', observed: state.eventCount, limit: budgetLimit(state, 'events') });
  } else if (state.costUsageUnknown) {
    stopForBudget(state, { dimension: 'costUsd', observed: 'unknown', limit: budgetLimit(state, 'costUsd') });
  } else if (state.observedCostUsd > budgetLimit(state, 'costUsd')) {
    stopForBudget(state, { dimension: 'costUsd', observed: state.observedCostUsd, limit: budgetLimit(state, 'costUsd') });
  }
}

function reportedCost(event, usage) {
  if (Object.prototype.hasOwnProperty.call(event, 'cost_usd')) return event.cost_usd;
  if (Object.prototype.hasOwnProperty.call(usage, 'cost_usd')) return usage.cost_usd;
  return undefined;
}

function hasTokenUsage(usage) {
  return ['input_tokens', 'output_tokens', 'cached_input_tokens',
    'cache_read_input_tokens', 'total_tokens', 'tokens']
    .some((key) => Object.prototype.hasOwnProperty.call(usage, key));
}

function nonnegativeCost(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && !raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function accountEvent(state, event) {
  state.eventCount += 1;
  const usage = readUsage(event);
  const reported = billableTokenCount(usage);
  if (hasTokenUsage(usage)) state.tokenUsageObserved = true;
  if (reported === null) {
    state.tokenUsageUnknown = true;
  } else if (reported > 0) {
    state.exactTokens = Math.max(state.exactTokens, reported);
  } else if (isAgentMessage(event)) {
    state.estimatedTokens += Math.ceil(Buffer.byteLength(messageText(event), 'utf8') / 4);
  }
  const cost = reportedCost(event, usage);
  if (cost !== undefined) {
    state.costUsageObserved = true;
    const value = nonnegativeCost(cost);
    if (value === null) state.costUsageUnknown = true;
    else state.observedCostUsd += value;
  }
}

function observeGenosTools(state, value) {
  // Codex emits MCP calls as item.completed events with a structured
  // mcp_tool_call item. Text that merely mentions a tool is not evidence that
  // it ran.
  if (value?.type !== 'item.completed') return;
  const item = value.item || {};
  if (item.type !== 'mcp_tool_call' || item.error || item.status === 'failed') return;
  const tool = typeof item.name === 'string' ? item.name : '';
  if (/^genos_[a-z0-9_]+$/.test(tool) && state.requiredTools.has(tool)) {
    state.observedTools.add(tool);
  }
}

function emitTurnStarted(state, event) {
  state.emit({ eventType: 'AGENT_STEP', action: 'THINK', detail: 'Implementation turn started.', payload: event });
}

function itemAction(event) {
  return (event.item || {}).type || 'EXECUTE';
}

function itemDetail(event, fallback) {
  const item = event.item || {};
  return item.command || item.text || fallback;
}

function emitItemStarted(state, event) {
  state.emit({ eventType: 'AGENT_STEP', action: itemAction(event), detail: itemDetail(event, 'Execution item started.'), payload: event });
}

function chaperoneItem(state, event) {
  const item = event.item || {};
  if (item.type !== 'agent_message' || typeof item.text !== 'string') return null;
  const c = immune.chaperoneAgentOutput(item.text, { prompt: state.mission.prompt });
  state.finalReportText = c.purifiedText || item.text;
  if (c.warning) {
    state.emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive observée dans le message agent.', severity: 'warning', payload: c.health });
  }
  return c.health;
}

function itemHasError(event) {
  const item = event.item || {};
  if (event.error || item.error) return true;
  return item.exit_code !== undefined && item.exit_code !== 0;
}

function recordTurn(state, event, hasError) {
  const item = event.item || {};
  state.recordedTurns.push({
    step: state.recordedTurns.length + 1,
    type: item.type || 'action',
    action: item.command || item.type || 'action',
    cmd: item.command || null,
    pass: !hasError,
    detail: String(item.command || item.text || '').slice(0, 300)
  });
}

function failedTurnCount(turns) {
  let count = 0;
  for (const turn of turns) {
    if (!turn.pass) count += 1;
  }
  return count;
}

function progressScoreFor(event, hasError) {
  const item = event.item || {};
  if (item.type === 'agent_message') return 1.0;
  return hasError ? 0.0 : 0.2;
}

function handleApoptosis(state) {
  state.emit({
    eventType: 'AGENT_HALTED', action: 'CELLULAR_APOPTOSIS',
    detail: `Cognitive apoptosis triggered (dissonance: ${state.conscienceState.dissonanceLevel.toFixed(1)}, budget: ${state.conscienceState.currentBudget.toFixed(0)}).`,
    severity: 'error', status: 'blocked', currentTask: 'Cellular apoptosis triggered',
    payload: { conscienceState: state.conscienceState }
  });
  terminateChild(state.child);
}

function persistIfAgent(state, reason) {
  if (!state.db || !state.hasAgentInDb) return;
  state.pendingConscienceOp = state.pendingConscienceOp
    .then(() => { return agentConscience.persistConscienceState(state.db, state.mission.agentId, state.conscienceState, { reason }); })
    .catch(() => {});
}

function evaluateConscience(state, info) {
  const errorsInLoop = failedTurnCount(state.recordedTurns.slice(-5));
  const progressScore = progressScoreFor(info.event, info.hasError);
  const evalResult = agentConscience.evaluateBranch(state.conscienceState, {
    errorsInLoop,
    progressScore,
    cognitiveHealth: info.ch || {}
  });
  if (evalResult.apoptoticTriggered) handleApoptosis(state);
}

function handleItemCompleted(state, event) {
  const ch = chaperoneItem(state, event);
  const hasError = itemHasError(event);
  recordTurn(state, event, hasError);
  state.emit({ eventType: 'AGENT_STEP', action: itemAction(event), detail: itemDetail(event, 'Execution item completed.'), payload: event });
  evaluateConscience(state, { event, hasError, ch });
  persistIfAgent(state, 'item_completed');
}

function driftFor(state) {
  if (!state.finalReportText) return null;
  return immune.evaluateCognitiveDrift(state.finalReportText);
}

function handleTurnCompleted(state, event) {
  state.codexTurnCompleted = true;
  const drift = driftFor(state);
  if (drift && drift.warning) {
    state.emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive ou répétition excessive observée.', severity: 'warning', payload: drift });
  }
  state.emit({ eventType: 'AGENT_STEP', action: 'VERIFY', detail: 'Implementation turn completed.', payload: event });
  persistIfAgent(state, 'turn_completed');
}

function dispatchEvent(state, event) {
  const type = String(event.type || '');
  if (type === 'thread.started' && /^[a-f0-9-]{36}$/.test(event.thread_id || '')) {
    state.codexThreadId = event.thread_id;
  } else if (type === 'turn.started') emitTurnStarted(state, event);
  else if (type === 'item.started') emitItemStarted(state, event);
  else if (type === 'item.completed') handleItemCompleted(state, event);
  else if (type === 'turn.completed') handleTurnCompleted(state, event);
}

function handleParsedEvent(state, event) {
  if (state.budgetStopped) return;
  accountEvent(state, event);
  observeGenosTools(state, event);
  dispatchEvent(state, event);
  enforceBudget(state);
}

function processLine(state, line) {
  let event;
  try { event = JSON.parse(line); } catch { return; }
  handleParsedEvent(state, event);
}

function handleStdout(state, chunk) {
  state.buffer += chunk.toString();
  if (Buffer.byteLength(state.buffer, 'utf8') > MAX_RUNTIME_LINE_BYTES) {
    stopForBudget(state, { dimension: 'outputBytes', observed: Buffer.byteLength(state.buffer, 'utf8'), limit: MAX_RUNTIME_LINE_BYTES });
    state.buffer = '';
    return;
  }
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() || '';
  for (const line of lines) {
    if (line) processLine(state, line);
  }
}

module.exports = { budgetLimit, stopForBudget, billableTokenCount, observeGenosTools, handleParsedEvent, handleStdout };
