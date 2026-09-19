'use strict';

const fs = require('fs');
const path = require('path');

const MAX_TOOL_ROUNDS = 12;
const MAX_TOOL_CALLS = 24;
const MAX_TOOL_RESULT_CHARS = 20000;

function loadLeasedTools(toolLease) {
  const file = path.resolve(__dirname, '../../shared/toolDefinitions.json');
  const definitions = JSON.parse(fs.readFileSync(file, 'utf8')).tools;
  const allowed = new Set(toolLease.filter((name) => name !== 'genos_orchestrate'));
  return definitions.filter((tool) => allowed.has(tool.name)).map(toOpenAiTool);
}

function toOpenAiTool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || tool.name,
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }
  };
}

function parseArguments(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  throw new Error('Solar returned invalid JSON for tool arguments.');
}

function responseText(reply) {
  const choice = reply?.choices?.[0];
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  return '';
}

function toolCallData(call) {
  const fn = call.function || {};
  return { id: call.id || `call-${Date.now()}`, name: fn.name || call.name, arguments: parseArguments(fn.arguments || call.arguments) };
}

function summarizeToolOutput(output) {
  let text;
  try { text = JSON.stringify(output); } catch (_) { text = String(output); }
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]` : text;
}

function toolResultMessage(call, output, failed) {
  return {
    role: 'tool',
    tool_call_id: call.id,
    content: failed ? `Tool error: ${summarizeToolOutput(output)}` : summarizeToolOutput(output)
  };
}

function accountUsage({ state, reply, messages, tools }) {
  const usage = reply?.usage || {};
  const reported = reportedTokens(usage);
  const estimate = estimateTokens({ messages, tools, reply });
  recordUsage({ state, usage, reported, estimate });
  enforceUsageBudgets(state);
}

function reportedTokens(usage) {
  return Number(usage.total_tokens || (Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0)));
}

function estimateTokens(payload) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(payload), 'utf8') / 4);
}

function recordUsage({ state, usage, reported, estimate }) {
  state.tokensUsed += reported || estimate;
  state.usage.input_tokens += Number(usage.prompt_tokens || 0);
  state.usage.output_tokens += Number(usage.completion_tokens || 0);
  state.usage.total_tokens = state.tokensUsed;
  state.costUsd += Number(usage.cost_usd || usage.cost || 0);
  if (state.costUsd > 0) state.usage.cost_usd = state.costUsd;
}

function enforceUsageBudgets(state) {
  enforceTokenBudget(state);
  enforceCostBudget(state);
}

function enforceTokenBudget(state) {
  const limit = Number(state.executionBudget.tokens || 0);
  if (limit > 0 && state.tokensUsed >= limit) throw new Error(`Solar tool loop exhausted token budget (${state.tokensUsed} >= ${limit}).`);
}

function enforceCostBudget(state) {
  const limit = Number(state.executionBudget.costUsd || 0);
  if (limit > 0 && state.costUsd > limit) throw new Error(`Solar tool loop exceeded cost budget (${state.costUsd} > ${limit}).`);
}

function remainingOutputTokens(state, messages, tools) {
  const limit = Number(state.executionBudget.tokens || 0);
  if (!limit) return 16384;
  const estimate = Math.ceil(Buffer.byteLength(JSON.stringify({ messages, tools }), 'utf8') / 4);
  const remaining = limit - state.tokensUsed - estimate;
  if (remaining <= 0) throw new Error(`Solar tool loop has no token budget remaining (${limit} tokens).`);
  return Math.min(16384, remaining);
}

function assertToolAllowed(state, name, availableTools) {
  if (!name || name === 'genos_orchestrate' || !state.toolLease.includes(name) || !availableTools.has(name)) {
    throw new Error(`Solar requested MCP tool '${name}' outside the mission lease.`);
  }
}

async function executeTool({ call, state, callTool, emit }) {
  assertWithinBudget(state);
  const eventLimit = Number(state.executionBudget.events || 0);
  if (eventLimit > 0 && state.eventCount + 2 > eventLimit) {
    throw new Error(`Solar tool call cannot reserve its tool and completion events within the ${eventLimit}-event budget.`);
  }
  const invocation = toolCallData(call);
  assertToolAllowed(state, invocation.name, state.availableToolNames);
  let result;
  let failed = false;
  try {
    result = await callTool({
      invocation: {
        name: invocation.name,
        arguments: invocation.arguments,
        agentContext: {
          agentId: state.mission.agentId,
          executionMode: state.mission.executionMode,
          orchestratorAgentId: state.mission.orchestratorAgentId,
          toolLease: state.toolLease
        }
      },
      state
    });
    failed = Boolean(result?.isError || result?.error);
  } catch (error) {
    result = { error: error.message };
    failed = true;
  }
  state.observedTools.add(invocation.name);
  state.recordedTurns.push({ step: state.recordedTurns.length + 1, action: invocation.name, pass: !failed });
  emit({
    eventType: 'AGENT_STEP', action: 'MCP_TOOL', detail: `Hermes called ${invocation.name}.`,
    payload: { tool: invocation.name, toolCallId: invocation.id, succeeded: !failed, usage: state.usage }
  });
  return toolResultMessage(invocation, result, failed);
}

async function runToolSession({ state, tools, sample, callTool, emit }) {
  state.availableToolNames = new Set(tools.map((tool) => tool.function.name));
  const messages = [{ role: 'user', content: state.framedPrompt }];
  let callCount = 0;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    assertWithinBudget(state);
    const reply = await sample({
      request: {
        model: state.model,
        messages,
        max_tokens: remainingOutputTokens(state, messages, tools),
        temperature: 0.3,
        top_p: 0.95,
        stream: false,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {})
      },
      state
    });
    accountUsage({ state, reply, messages, tools });
    const message = reply?.choices?.[0]?.message;
    const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!calls.length) return responseText(reply);
    if (callCount + calls.length > MAX_TOOL_CALLS) throw new Error(`Solar tool loop exceeded ${MAX_TOOL_CALLS} calls.`);
    messages.push({ role: 'assistant', content: message.content || null, tool_calls: calls });
    for (const call of calls) {
      messages.push(await executeTool({ call, state, callTool, emit }));
      callCount += 1;
    }
  }
  throw new Error(`Solar tool loop exceeded ${MAX_TOOL_ROUNDS} rounds.`);
}

async function callSolar({ request, state }) {
  const credentials = require('./solarDirectContext.cjs').credentials;
  if (!credentials?.accessToken) throw new Error('Hermes Nous OAuth token is unavailable.');
  const baseUrl = process.env.GENOS_SOLAR_API_URL || 'https://inference-api.nousresearch.com/v1';
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return postJson({
    url,
    headers: { authorization: `Bearer ${credentials.accessToken}`, provider: 'nous' },
    body: { ...request, model: request.model || process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free' },
    state,
    label: 'Solar API'
  });
}

async function callLeasedTool({ invocation, state }) {
  const url = process.env.GENOS_MCP_TOOL_URL;
  if (!url) throw new Error('GenOS MCP tool bridge is not configured.');
  const token = process.env.GENOS_MCP_SAMPLING_TOKEN || process.env.GENOS_SAMPLING_TOKEN || '';
  const response = await postJson({
    url,
    headers: { authorization: `Bearer ${token}` },
    body: invocation,
    state,
    label: 'GenOS MCP tool bridge'
  });
  return response.result;
}

async function postJson({ url, headers, body, state, label }) {
  const timeoutMs = requestTimeout(state);
  const controller = new AbortController();
  const abort = () => controller.abort();
  state.abortController.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal
    });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { throw new Error(`${label} returned invalid JSON.`); }
    if (!response.ok || parsed.error) throw new Error(parsed.error?.message || parsed.error || `${label} failed with HTTP ${response.status}.`);
    return parsed;
  } catch (error) {
    if (state.abortController.signal.aborted) throw new Error('Solar mission was cancelled.');
    if (controller.signal.aborted) throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
    state.abortController.signal.removeEventListener('abort', abort);
  }
}

function requestTimeout(state) {
  const override = Number(process.env.GENOS_SOLAR_SAMPLING_TIMEOUT_MS || process.env.GENOS_MCP_SAMPLING_TIMEOUT_MS || 0);
  const latency = Number(state.executionBudget.latencyMs || 0);
  const remaining = latency > 0 ? latency - (Date.now() - state.startedAt) : 300000;
  if (remaining <= 0) throw new Error(`Solar generation exceeded latency budget (${latency}ms).`);
  return Math.max(1, Math.min(override || remaining, remaining));
}

function assertWithinBudget(state) {
  if (state.abortController.signal.aborted) throw new Error('Solar mission was cancelled.');
  const elapsed = Date.now() - state.startedAt;
  const latency = Number(state.executionBudget.latencyMs || 0);
  if (latency > 0 && elapsed >= latency) throw new Error(`Solar generation exceeded latency budget (${latency}ms).`);
  const eventLimit = Number(state.executionBudget.events || 0);
  if (eventLimit > 0 && state.eventCount >= eventLimit) throw new Error(`Solar runtime exceeded event budget (${eventLimit}).`);
}

module.exports = { loadLeasedTools, parseArguments, runToolSession, callSolar, callLeasedTool, MAX_TOOL_ROUNDS, MAX_TOOL_CALLS };
