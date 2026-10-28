#!/usr/bin/env node
/* Runtime adapter: GenOS owns the agent lifecycle; the connected MCP host owns generation. */
const http = require('http');
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const { createContext, finishContext } = require('./caller-mcp-context.cjs');
const sharedBudget = require('../src/services/externalSubprocessModelBudget');
const { assertMissionPromptBudget, estimateInputTokens } = require('../src/services/agentRuntimeAdapter/missionPromptBudget');
const SYSTEM_PROMPT = 'You are an agent executing under GenOS governance. Return only the requested result.';

let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { input = Buffer.concat([input, chunk]); });
process.stdin.on('end', () => run(input).catch((error) => fail(error)));

async function run(raw) {
  const mission = decodeMissionInput(raw);
  const state = createContext(mission, (event) => process.stdout.write(encodeEvent({ ...event, agentId: mission.agentId })));
  state.modelBudgetRoute = await sharedBudget.openForState(state);
  try {
    const prompt = state.prompt;
    const inputTokens = estimateInputTokens([SYSTEM_PROMPT, prompt]);
    assertMissionPromptBudget(mission, prompt, SYSTEM_PROMPT);
    const maxTokens = resolveMaxTokens(state.executionBudget, inputTokens);
    if (mission.contextTokenBudget !== undefined && mission.contextTokenBudget !== null) {
      await require('../src/services/agentMemoryVesicles').consumeVesicles(mission.agentId);
    }
    state.emit({ eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Caller MCP cognitive runtime accepted the mission.', payload: {
      executor: 'caller_mcp',
      provider: mission.provider || process.env.GENOS_MCP_PROVIDER || 'unknown',
      modelId: mission.modelId || process.env.GENOS_MCP_MODEL_ID || 'unknown',
      hostExecutionContext: state.hostExecutionContext
    }, status: 'running' });
    const response = await sampleWithTools({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      maxTokens,
      agentContext: { agentId: mission.agentId, executionRunId: mission.executionRunId,
        organizationId: mission.organizationId, projectId: mission.projectId,
        executionMode: mission.executionMode, orchestratorAgentId: mission.orchestratorAgentId,
        toolLease: state.toolLease },
      systemPrompt: SYSTEM_PROMPT
    }, state);
    const text = extractText(response);
    if (!text.trim()) throw new Error('MCP sampling returned an empty response.');
    state.estimatedTokens = inputTokens + Math.ceil(Buffer.byteLength(text) / 4);
    await finishContext(state, text);
  } finally {
    await sharedBudget.close(state.modelBudgetRoute);
  }
  process.stdout.write('', () => process.exit(process.exitCode || 0));
}

function resolveMaxTokens(executionBudget, inputTokens) {
  const tokenBudget = Number(executionBudget.tokens || 2048);
  const remaining = Math.floor(tokenBudget - inputTokens);
  if (!Number.isSafeInteger(tokenBudget) || remaining < 1) {
    const error = new Error(`Caller-MCP input estimate ${inputTokens} leaves no completion token within token budget ${tokenBudget}.`);
    error.code = 'CALLER_MCP_TOKEN_BUDGET_EXCEEDED';
    error.estimatedInputTokens = inputTokens;
    error.tokenBudget = tokenBudget;
    throw error;
  }
  return remaining;
}

async function sampleWithTools(params, state) {
  let messages = params.messages;
  for (let round = 0; round < 12; round += 1) {
    const request = { ...params, messages };
    const result = await sharedBudget.sample(state, request, sample);
    const blocks = Array.isArray(result?.content) ? result.content : [];
    const calls = blocks.filter((block) => block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'function_call');
    if (!calls.length) return result;
    messages = messages.concat([{ role: 'assistant', content: blocks }]);
    const toolResults = [];
    for (const call of calls) {
      toolResults.push(await executeToolCall({ call, context: params.agentContext, state }));
    }
    messages.push({ role: 'user', content: toolResults });
  }
  throw new Error('MCP sampling tool loop exceeded 12 rounds.');
}

async function executeToolCall({ call, context, state }) {
  const name = call.name || call.function?.name;
  const input = call.input || call.arguments || call.function?.arguments || {};
  const output = await callTool({ name, arguments: typeof input === 'string' ? JSON.parse(input) : input, agentContext: context });
  state.observedTools.add(name);
  state.recordedTurns.push({ action: name, pass: !output.isError });
  return { type: 'tool_result', toolUseId: call.id || call.call_id || name, content: [{ type: 'text', text: JSON.stringify(output) }] };
}

function sample(params) {
  const url = new URL(process.env.GENOS_MCP_SAMPLING_URL);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { authorization: `Bearer ${process.env.GENOS_SAMPLING_TOKEN || process.env.GENOS_MCP_SAMPLING_TOKEN}`, 'content-type': 'application/json' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed; try { parsed = JSON.parse(body); } catch (_) { reject(new Error('Invalid MCP sampling response.')); return; }
        if (res.statusCode < 200 || res.statusCode >= 300 || parsed.error) reject(new Error(parsed.error || `MCP sampling failed with HTTP ${res.statusCode}.`));
        else resolve(parsed.result);
      });
    });
    req.on('error', reject);
    req.setTimeout(Number(process.env.GENOS_MCP_SAMPLING_TIMEOUT_MS || 300000), () => req.destroy(new Error('MCP sampling timed out.')));
    req.end(JSON.stringify({ params }));
  });
}

function callTool(payload) {
  const url = new URL(process.env.GENOS_MCP_TOOL_URL);
  return new Promise((resolve, reject) => {
    const headers = { authorization: `Bearer ${process.env.GENOS_MCP_SAMPLING_TOKEN}`, 'content-type': 'application/json' };
    if (process.env.GENOS_MCP_ACTOR_TOKEN) headers['X-GenOS-MCP-Actor-Token'] = process.env.GENOS_MCP_ACTOR_TOKEN;
    const req = http.request(url, { method: 'POST', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => parseToolResponse({ body, status: res.statusCode, resolve, reject }));
    });
    req.on('error', reject);
    req.setTimeout(Number(process.env.GENOS_MCP_SAMPLING_TIMEOUT_MS || 300000), () => req.destroy(new Error('MCP tool call timed out.')));
    const context = payload.agentContext || {};
    req.end(JSON.stringify({ ...payload, agentId: context.agentId, runId: context.executionRunId,
      organizationId: context.organizationId, projectId: context.projectId }));
  });
}

function parseToolResponse({ body, status, resolve, reject }) {
  let parsed;
  try { parsed = JSON.parse(body); } catch (_) { reject(new Error('Invalid MCP tool response.')); return; }
  if (status < 200 || status >= 300 || parsed.error) reject(new Error(parsed.error || `MCP tool bridge failed with HTTP ${status}.`));
  else resolve(parsed.result);
}

function extractText(result) {
  if (typeof result === 'string') return result;
  if (!result) return '';
  return extractContent(result.content) || String(result.text || '');
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (!content) return '';
  if (content.type === 'text') return String(content.text || '');
  if (Array.isArray(content)) return extractBlocks(content);
  return '';
}

function extractBlocks(blocks) {
  return blocks.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
}

function fail(error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
