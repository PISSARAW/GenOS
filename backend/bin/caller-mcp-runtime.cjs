#!/usr/bin/env node
/* Runtime adapter: GenOS owns the agent lifecycle; the connected MCP host owns generation. */
const http = require('http');
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');

let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { input = Buffer.concat([input, chunk]); });
process.stdin.on('end', () => run(input).catch((error) => fail(error)));

async function run(raw) {
  const mission = decodeMissionInput(raw);
  const prompt = mission.prompt || mission.currentTask || 'No prompt provided';
  emit(mission, 'AGENT_PLAN_CREATED', 'PLAN', 'Caller MCP cognitive runtime accepted the mission.', { executor: 'caller_mcp', provider: mission.provider || process.env.GENOS_MCP_PROVIDER || 'mcp-host' }, 'running');
  const response = await sampleWithTools({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: Number(JSON.parse(mission.executionBudgetJson || '{}').tokens || 2048),
    systemPrompt: 'You are an agent executing under GenOS governance. Return only the requested result.'
  });
  const text = extractText(response);
  if (!text.trim()) throw new Error('MCP sampling returned an empty response.');
  emit(mission, 'EVIDENCE_REPORT', 'EVIDENCE', 'Caller MCP response attached as agent evidence.', {
    evidenceReport: { outcome: 'success', claims: [{ claim: text.slice(0, 4000), evidence: [{ type: 'text', content: text.slice(0, 4000) }] }] },
    response: text,
    executor: 'caller_mcp',
    provider: mission.provider || process.env.GENOS_MCP_PROVIDER || 'mcp-host'
  });
  emit(mission, 'AGENT_COMPLETED', 'COMPLETE', 'Caller MCP cognitive execution completed.', { response: text }, 'completed');
  process.exit(0);
}

async function sampleWithTools(params) {
  let messages = params.messages;
  for (let round = 0; round < 12; round += 1) {
    const result = await sample({ ...params, messages });
    const blocks = Array.isArray(result?.content) ? result.content : [];
    const calls = blocks.filter((block) => block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'function_call');
    if (!calls.length) return result;
    messages = messages.concat([{ role: 'assistant', content: blocks }]);
    const toolResults = [];
    for (const call of calls) {
      const name = call.name || call.function?.name;
      const input = call.input || call.arguments || call.function?.arguments || {};
      const output = await callTool({ name, arguments: typeof input === 'string' ? JSON.parse(input) : input });
      toolResults.push({ type: 'tool_result', tool_use_id: call.id || call.call_id || name, content: JSON.stringify(output) });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  throw new Error('MCP sampling tool loop exceeded 12 rounds.');
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
      res.on('end', () => {
        let parsed; try { parsed = JSON.parse(body); } catch (_) { reject(new Error('Invalid MCP tool response.')); return; }
        if (res.statusCode < 200 || res.statusCode >= 300 || parsed.error) reject(new Error(parsed.error || `MCP tool bridge failed with HTTP ${res.statusCode}.`));
        else resolve(parsed.result);
      });
    });
    req.on('error', reject);
    req.setTimeout(Number(process.env.GENOS_MCP_SAMPLING_TIMEOUT_MS || 300000), () => req.destroy(new Error('MCP tool call timed out.')));
    req.end(JSON.stringify(payload));
  });
}

function extractText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.content === 'string') return result.content;
  if (Array.isArray(result?.content)) return result.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  return String(result?.text || '');
}

function emit(mission, eventType, action, detail, payload, status = '') {
  process.stdout.write(encodeEvent({ agentId: mission.agentId, eventType, action, detail, payload, status }));
}

function fail(error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
