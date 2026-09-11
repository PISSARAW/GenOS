const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.htm') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function isBlockedName(resolved) {
  const base = path.basename(resolved);
  if (base.startsWith('.')) return true;
  if (base.toLowerCase() === '.env') return true;
  if (resolved.toLowerCase().endsWith('.db')) return true;
  return false;
}

function stripQuery(rawUrl) {
  const text = String(rawUrl || '/');
  const noQuery = text.split('?')[0];
  return noQuery.split('#')[0];
}

function resolveSafePath(dir, rawUrl) {
  let rel = stripQuery(rawUrl);
  if (rel === '/') rel = '/index.html';
  if (rel.startsWith('/')) rel = rel.slice(1);
  let decoded = rel;
  try {
    decoded = decodeURIComponent(rel);
  } catch (_) {
    return null;
  }
  const normalized = path.normalize(decoded);
  if (normalized === '..') return null;
  if (normalized.startsWith('..' + path.sep)) return null;
  const resolved = path.join(dir, normalized);
  const withSep = dir.endsWith(path.sep) ? dir : dir + path.sep;
  if (resolved !== dir) {
    if (!resolved.startsWith(withSep)) return null;
  }
  if (isBlockedName(resolved)) return null;
  return resolved;
}

function sendStatus(res, code, headers) {
  res.writeHead(code, headers || {});
  res.end();
}

function serveFile(req, res, filePath) {
  if (req.method !== 'GET') {
    if (req.method !== 'HEAD') {
      sendStatus(res, 405, { Allow: 'GET, HEAD' });
      return;
    }
  }
  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    sendStatus(res, 404);
    return;
  }
  if (!stat.isFile()) {
    sendStatus(res, 404);
    return;
  }
  if (stat.size > MAX_FILE_BYTES) {
    sendStatus(res, 413);
    return;
  }
  const data = fs.readFileSync(filePath);
  if (data.length > MAX_FILE_BYTES) {
    sendStatus(res, 413);
    return;
  }
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath), 'Content-Length': data.length });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(data);
}

function handleRequest(dir, req, res) {
  const filePath = resolveSafePath(dir, req.url);
  if (!filePath) {
    sendStatus(res, 404);
    return;
  }
  serveFile(req, res, filePath);
}

function isRootUser() {
  try {
    const info = os.userInfo();
    return info.uid === 0;
  } catch (_) {
    return false;
  }
}

function puppeteerLaunchOptions() {
  if (isRootUser()) return { args: ['--no-sandbox'] };
  return {};
}

function collectConsoleError(msg, errors) {
  if (msg.type() === 'error') errors.push(msg.text());
}

async function collectPageErrors(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => collectConsoleError(msg, errors));
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  return errors;
}

function listenAsync(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve(server.address().port));
  });
}

function reportErrors(errors) {
  if (errors.length > 0) {
    console.error('RUNTIME ERRORS DETECTED:');
    for (const entry of errors) console.error(entry);
    return 1;
  }
  console.log('No runtime errors.');
  return 0;
}

async function runArbiter() {
  const dir = path.resolve(process.argv[2] || process.cwd());
  if (!fs.existsSync(path.join(dir, 'index.html'))) return 0;
  const server = http.createServer((req, res) => handleRequest(dir, req, res));
  const port = await listenAsync(server);
  const url = 'http://localhost:' + port + '/';
  console.log('runtime_arbiter serving ' + url);
  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const errors = await collectPageErrors(browser, url);
    return reportErrors(errors);
  } finally {
    await browser.close();
    server.close();
  }
}

async function run() {
  try {
    process.exit(await runArbiter());
  } catch (err) {
    console.error('[runtime_arbiter] fatal:', err.message);
    process.exit(2);
  }
}

run();
