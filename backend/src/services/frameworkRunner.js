const crypto = require('crypto');

const FRAMEWORKS = new Set(['langgraph', 'autogen', 'crewai', 'langfuse', 'phoenix']);
const endpointVariable = framework => `GENOS_${framework.toUpperCase()}_URL`;
const keyVariable = framework => `GENOS_${framework.toUpperCase()}_API_KEY`;

function traceparent(traceId) {
  const trace = String(traceId || crypto.randomUUID().replace(/-/g, '')).replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 32);
  const span = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `00-${trace}-${span}-01`;
}

function body(framework, input, config) {
  if (framework === 'langgraph') return { input, config };
  if (framework === 'autogen') return { task: input, config };
  if (framework === 'crewai') return { inputs: input, config };
  return { ...input, config };
}

function resolve(framework) {
  if (!FRAMEWORKS.has(framework)) throw new Error(`Unsupported framework: ${framework}`);
  const endpoint = process.env[endpointVariable(framework)];
  if (!endpoint) throw new Error(`${endpointVariable(framework)} is not configured`);
  const parsed = new URL(endpoint);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Framework endpoint must use HTTP or HTTPS');
  return { endpoint: parsed.toString(), apiKey: process.env[keyVariable(framework)] };
}

async function execute(framework, input = {}, config = {}, options = {}) {
  const target = options.target || resolve(framework);
  const traceId = options.traceId || crypto.randomUUID().replace(/-/g, '');
  const response = await (options.fetchFn || fetch)(target.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', traceparent: traceparent(traceId), ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}) },
    body: JSON.stringify(body(framework, input, config))
  });
  const text = await response.text();
  let output;
  try { output = text ? JSON.parse(text) : {}; } catch (_) { output = { text }; }
  if (!response.ok) throw new Error(`${framework} execution returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  return { framework, traceId, status: response.status, output };
}

module.exports = { FRAMEWORKS, execute, resolve, traceparent, body };
