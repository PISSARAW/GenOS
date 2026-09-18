#!/usr/bin/env node
/* Runtime adapter: GenOS owns the agent lifecycle; the connected MCP host owns generation. */
const http = require('http');
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const { createContext, finishContext } = require('./caller-mcp-context.cjs');

let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { input = Buffer.concat([input, chunk]); });
process.stdin.on('end', () => run(input).catch((error) => fail(error)));

async function run(raw) {
  const mission = decodeMissionInput(raw);
  const state = createContext(mission, (event) => process.stdout.write(encodeEvent({ ...event, agentId: mission.agentId })));
  const prompt = state.prompt;
  state.emit({ eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Caller MCP cognitive runtime accepted the mission.', payload: { executor: 'caller_mcp', provider: mission.provider || process.env.GENOS_MCP_PROVIDER || 'mcp-host' }, status: 'running' });
  const response = await sampleWithTools({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: Math.max(1, Number(state.executionBudget.tokens || 2048) - Math.ceil(Buffer.byteLength(prompt) / 4)),
    agentContext: { agentId: mission.agentId, executionMode: mission.executionMode, orchestratorAgentId: mission.orchestratorAgentId, toolLease: state.toolLease },
    systemPrompt: 'You are an agent executing under GenOS governance. Return only the requested result.'
  }, state);
  const text = extractText(response);
  if (!text.trim()) throw new Error('MCP sampling returned an empty response.');
  state.estimatedTokens = Math.ceil((Buffer.byteLength(prompt) + Buffer.byteLength(text)) / 4);
  await finishContext(state, text);
  process.stdout.write('', () => process.exit(process.exitCode || 0));
}

async function sampleWithTools(params, state) {
  let messages = params.messages;
  for (let round = 0; round < 12; round += 1) {
    const result = await sample({ ...params, messages });
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
    const req = http.request(url, { method: 'POST', headers: { authorization: `Bearer ${process.env.GENOS_MCP_SAMPLING_TOKEN}`, 'content-type': 'application/json' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => parseToolResponse({ body, status: res.statusCode, resolve, reject }));
    });
    req.on('error', reject);
    req.setTimeout(Number(process.env.GENOS_MCP_SAMPLING_TIMEOUT_MS || 300000), () => req.destroy(new Error('MCP tool call timed out.')));
    req.end(JSON.stringify(payload));
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
