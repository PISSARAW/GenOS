import http from 'http';
import crypto from 'crypto';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createSamplingBroker(server) {
  const token = crypto.randomBytes(24).toString('hex');
  const listener = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/sample' || req.headers.authorization !== `Bearer ${token}`) {
      json(res, 404, { error: 'sampling endpoint unavailable' });
      return;
    }
    try {
      const input = JSON.parse(await readBody(req));
      const result = await server.createMessage(input.params || input);
      json(res, 200, { result });
    } catch (error) {
      json(res, 502, { error: error.message });
    }
  });
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      resolve({ url: `http://127.0.0.1:${address.port}/sample`, token, close: () => listener.close() });
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
