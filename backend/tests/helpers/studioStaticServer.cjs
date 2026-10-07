'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../../../integrations/studio');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css' };

function serve(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const name = pathname === '/studio/' ? 'index.html' : pathname.slice('/studio/'.length);
  const valid = pathname.startsWith('/studio/') && /^[a-zA-Z][a-zA-Z0-9.-]*$/.test(name);
  const file = path.join(root, valid ? name : '__missing__');
  if (!valid || !fs.existsSync(file) || !types[path.extname(file)]) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] });
  response.end(fs.readFileSync(file));
}

async function start() {
  const server = http.createServer(serve);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}/studio/`,
    close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { start };
