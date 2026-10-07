'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const digest = value => crypto.createHash('sha256').update(
  typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const assetDigest = value => digest(String(value).replace(/\r?\n/g, '\r\n'));

function hashes(directory, prefix = '', dependencies = false) {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['__pycache__', '.git'].includes(entry.name) || entry.name === 'node_modules' && !dependencies) continue;
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(filename, relative, dependencies));
    else if (/\.(?:cjs|js|py|json|node|mjs|wasm|proto|cedar|cedarschema|sql|yaml|yml|txt|md|exe|dll|olean|private|server|ilean|ir|sig)$/.test(filename)) result[relative] = digest(fs.readFileSync(filename));
  }
  return result;
}

function sourceHashes() {
  const result = {};
  for (const directory of ['backend/src', 'backend/bin', 'backend/proto', 'backend/policies', 'scripts', 'mcp', 'shared', 'benchmarks/p0-pilots/v1',
    'benchmarks/suites/formal_math/v1/oracle', 'benchmarks/suites/formal_math/v1/public']) {
    const found = hashes(path.join(root, directory));
    for (const [name, hash] of Object.entries(found)) result[directory + '/' + name] = hash;
  }
  for (const name of ['package.json', 'package-lock.json', 'backend/package.json', 'backend/package-lock.json']) {
    result[name] = digest(fs.readFileSync(path.join(root, name)));
  }
  return result;
}

function dependencyHashes() {
  const result = {};
  for (const directory of ['backend/node_modules', 'node_modules']) {
    const found = hashes(path.join(root, directory), directory, true);
    Object.assign(result, found);
  }
  return result;
}

function drift(expected, current) {
  return [...new Set([...Object.keys(expected), ...Object.keys(current)])].filter(name => expected[name] !== current[name]);
}

function validateAssets() {
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'dataset.lock.json')));
  for (const [name, hash] of Object.entries(lock.assets)) {
    const text = fs.readFileSync(path.join(__dirname, name), 'utf8');
    if (assetDigest(text) !== hash) throw new Error('Versioned dataset integrity failure: ' + name);
  }
  return lock;
}

async function modelIdentity(protocol) {
  const base = new URL(protocol.endpoint).origin;
  const get = route => fetch(base + route, { signal: AbortSignal.timeout(10000) }).then(response => response.json());
  const tags = await get('/api/tags');
  const model = tags.models.find(row => row.name === protocol.model.replace('ollama://', ''));
  if (!model || model.digest !== protocol.modelDigest) throw new Error('Frozen model digest unavailable');
  const version = await get('/api/version');
  const show = await fetch(base + '/api/show', { method: 'POST', body: JSON.stringify({ model: model.name }),
    signal: AbortSignal.timeout(10000) }).then(response => response.json());
  return { digest: model.digest, version: version.version, details: model.details,
    parameters: show.parameters, templateHash: digest(show.template || ''), modelInfo: show.model_info };
}

function leanIdentity() {
  const executable = process.env.GENOS_LEAN_EXECUTABLE;
  if (!executable) throw new Error('GENOS_LEAN_EXECUTABLE required');
  const toolchain = path.resolve(path.dirname(executable), '..');
  return { executable, raw: execFileSync(executable, ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 10000 }).trim(),
    hash: digest(fs.readFileSync(executable)), libraries: {
      bin: hashes(path.join(toolchain, 'bin')), core: hashes(path.join(toolchain, 'lib/lean')) } };
}

function hostIdentity() {
  return { node: process.version, executable: process.execPath, nodeHash: digest(fs.readFileSync(process.execPath)),
    platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length, totalMemory: os.totalmem() };
}

module.exports = { root, digest, assetDigest, hashes, sourceHashes, dependencyHashes, drift, validateAssets, modelIdentity, leanIdentity, hostIdentity };
