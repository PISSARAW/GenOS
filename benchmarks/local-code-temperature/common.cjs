'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const ROOT = path.resolve(process.env.GENOS_TEMPERATURE_LAB || 'D:/GenOS-Experiments/local-code-temp-20261104');
const SOURCE = path.join(ROOT, 'runtime/source');
const LIVE = path.resolve(process.env.GENOS_TEMPERATURE_DEPENDENCIES || path.join(__dirname, '../..'));
const CONFIG = Object.freeze({ model: 'qwen2.5-coder:7b',
  digest: 'dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364',
  endpoint: 'http://127.0.0.1:11434', totalTokens: 8192, outputTokens: 1536,
  contextTokens: 8192, deadlineMs: 120000, generationDeadlineMs: 110000,
  oracleDeadlineMs: 15000, topP: 0.9 });
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function fileHash(file) { return hash(fs.readFileSync(file)); }
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}
function inside(root, relative) {
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(path.resolve(root) + path.sep), 'Path outside lab scope');
  return file;
}
function setup(archive) {
  const temp = inside(archive, 'tmp');
  fs.mkdirSync(temp, { recursive: true });
  Object.assign(process.env, { TEMP: temp, TMP: temp, TMPDIR: temp, GENOS_TEST_TEMP_ROOT: temp,
    GENOS_DISABLE_DOTENV: '1', NODE_DISABLE_COMPILE_CACHE: '1',
    NODE_PATH: path.join(LIVE, 'backend/node_modules') + path.delimiter + path.join(LIVE, 'node_modules') });
  require('node:module').Module._initPaths();
}
function service(name) { return require(path.join(SOURCE, 'backend/src/services', name)); }
function cli(args) {
  const result = cp.spawnSync(path.join(ROOT, 'runtime/genos.exe'), ['genome', ...args],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
async function api(route, body, timeout = 5000) {
  const started = performance.now();
  const response = await fetch(CONFIG.endpoint + route, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  assert.equal(response.status, 200, text.slice(0, 1000));
  return { data: JSON.parse(text), wallMs: performance.now() - started };
}
async function modelIdentity() {
  const { data } = await api('/api/tags');
  const model = data.models.find(item => item.name === CONFIG.model);
  assert.equal(model?.digest, CONFIG.digest, 'Model digest changed');
  assert.equal(model.details.format, 'gguf', 'Experiment requires local weights');
  return { name: model.name, digest: model.digest, size: model.size, details: model.details };
}
function sources() {
  const files = fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs')).sort();
  return Object.fromEntries(files.map(name => [name, fileHash(path.join(__dirname, name))]));
}
module.exports = { fs, path, assert, cp, ROOT, SOURCE, LIVE, CONFIG, hash, fileHash,
  read, write, inside, setup, service, cli, api, modelIdentity, sources };
