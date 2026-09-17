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
        if (!toolHandler) throw new Error('MCP tool bridge is not ready.');
        json(res, 200, { result: await toolHandler(input) });
        return;
      }
      const params = { ...(input.params || input) };
      if (!params.tools && tools.length) params.tools = tools;
      const result = await server.createMessage(params);
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; if (body.length > 1024 * 1024) reject(new Error('sampling request too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
