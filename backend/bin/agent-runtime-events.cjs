const { terminateChild } = require('../src/services/processTermination');
const immune = require('../src/services/immuneSystem');
const agentConscience = require('../src/services/agentConscienceService');
const MAX_RUNTIME_LINE_BYTES = 4 * 1024 * 1024;

function budgetLimit(state, key) {
  const value = Number(state.executionBudget[key]);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
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

function reportedTokenCount(usage) {
  const fallback = Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0);
  return Number(usage.total_tokens || fallback || 0);
}

function isAgentMessage(event) {
  return event.type === 'agent_message' || (event.item || {}).type === 'agent_message';
}

function messageText(event) {
  return String((event.item || {}).text || event.text || '');
}

function enforceBudget(state) {
  const observedTokens = state.exactTokens || state.estimatedTokens;
  if (observedTokens > budgetLimit(state, 'tokens')) {
    stopForBudget(state, { dimension: 'tokens', observed: observedTokens, limit: budgetLimit(state, 'tokens') });
  } else if (state.eventCount > budgetLimit(state, 'events')) {
    stopForBudget(state, { dimension: 'events', observed: state.eventCount, limit: budgetLimit(state, 'events') });
  } else if (state.observedCostUsd > budgetLimit(state, 'costUsd')) {
    stopForBudget(state, { dimension: 'costUsd', observed: state.observedCostUsd, limit: budgetLimit(state, 'costUsd') });
  }
}

function accountEvent(state, event) {
  state.eventCount += 1;
  const usage = readUsage(event);
  const reported = reportedTokenCount(usage);
  if (reported > 0) {
    state.exactTokens = Math.max(state.exactTokens, reported);
  } else if (isAgentMessage(event)) {
    state.estimatedTokens += Math.ceil(Buffer.byteLength(messageText(event), 'utf8') / 4);
  }
  state.observedCostUsd += Number(event.cost_usd || usage.cost_usd || 0);
  enforceBudget(state);
}

function observeGenosTools(state, value) {
  const text = JSON.stringify(value || {});
  for (const tool of state.requiredTools) {
    const suffix = tool.replace(/^genos_/, '');
    if (text.includes(tool) || text.includes(`__${suffix}`) || text.includes(`"${suffix}"`)) state.observedTools.add(tool);
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
  const drift = driftFor(state);
  if (drift && drift.warning) {
    state.emit({ eventType: 'INFLAMMATION_DETECTED', action: 'MACROPHAGE', detail: 'Dérive cognitive ou répétition excessive observée.', severity: 'warning', payload: drift });
  }
  state.emit({ eventType: 'AGENT_STEP', action: 'VERIFY', detail: 'Implementation turn completed.', payload: event });
  persistIfAgent(state, 'turn_completed');
}

function dispatchEvent(state, event) {
  const type = String(event.type || '');
  if (type === 'turn.started') emitTurnStarted(state, event);
  else if (type === 'item.started') emitItemStarted(state, event);
  else if (type === 'item.completed') handleItemCompleted(state, event);
  else if (type === 'turn.completed') handleTurnCompleted(state, event);
}

function handleParsedEvent(state, event) {
  accountEvent(state, event);
  if (state.budgetStopped) return;
  observeGenosTools(state, event);
  dispatchEvent(state, event);
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

module.exports = { budgetLimit, stopForBudget, handleStdout };
