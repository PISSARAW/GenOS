import http from 'http';
import crypto from 'crypto';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createSamplingBroker(server, tools = []) {
  const token = crypto.randomBytes(24).toString('hex');
  let toolHandler = null;
  const listener = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !['/sample', '/tool'].includes(req.url) || req.headers.authorization !== `Bearer ${token}`) {
      json(res, 404, { error: 'sampling endpoint unavailable' });
      return;
    }
    try {
      const input = JSON.parse(await readBody(req));
      if (req.url === '/tool') {
        json(res, 200, { result: await dispatchTool(input, toolHandler) });
        return;
      }
      const result = await server.createMessage(samplingParams(input, tools));
      json(res, 200, { result });
    } catch (error) {
      json(res, 502, { error: error.message });
    }
  });
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      const root = `http://127.0.0.1:${address.port}`;
      resolve({ url: `${root}/sample`, toolUrl: `${root}/tool`, token, setToolHandler: (handler) => { toolHandler = handler; }, close: () => listener.close() });
    });
  });
}

function agentContext(input) {
  return input.agentContext || input.params?.agentContext || {};
}

function agentLease(context) {
  return Array.isArray(context.toolLease) ? context.toolLease : [];
}

async function dispatchTool(input, handler) {
  const context = agentContext(input);
  if (!agentLease(context).includes(input.name)) throw new Error('Tool is outside the agent MCP lease.');
  const orchestration = ['genos_orchestrate', 'genos_delegate_worker', 'genos_a_team_preview', 'genos_trinity_launch', 'genos_biological_mode'];
  if (context.executionMode === 'worker' && orchestration.includes(input.name)) throw new Error('Workers cannot orchestrate.');
  if (!handler) throw new Error('MCP tool bridge is not ready.');
  return handler(input);
}

function samplingParams(input, tools) {
  const params = { ...(input.params || input) };
  delete params.agentContext;
  const lease = agentLease(agentContext(input));
  const scoped = tools.filter((tool) => lease.includes(tool.name));
  if (scoped.length) params.tools = scoped.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  else delete params.tools;
  return params;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; if (body.length > 1024 * 1024) reject(new Error('sampling request too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
