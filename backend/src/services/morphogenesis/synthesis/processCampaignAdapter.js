'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EXTERNAL_FRAMEWORKS } = require('./pairedCampaignGate');
const externalAttestation = require('./externalAdapterAttestation');

const MAX_OUTPUT_BYTES = 1024 * 1024;

function shaFile(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function requireDigest(value, field) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value || ''))) throw new Error(`${field} must be a SHA-256 digest.`);
}

function requireAbsoluteFile(file, field) {
  if (!path.isAbsolute(file) || !fs.statSync(file).isFile()) throw new Error(`${field} must be an existing absolute file.`);
}

function validateArtifact(config) {
  requireAbsoluteFile(config.command, 'adapter command');
  requireDigest(config.commandSha256, 'commandSha256');
  if (shaFile(config.command) !== config.commandSha256) throw new Error('Adapter command digest mismatch.');
  requireAbsoluteFile(config.artifactPath, 'adapter artifact');
  requireDigest(config.artifactSha256, 'artifactSha256');
  if (shaFile(config.artifactPath) !== config.artifactSha256) throw new Error('Adapter artifact digest mismatch.');
}

function validateFramework(config, conditionId) {
  const allowed = EXTERNAL_FRAMEWORKS[conditionId];
  if (allowed) {
    const scopeAllowed = ['external-framework', 'test-fixture'].includes(config.evidenceScope);
    if (config.provenance !== 'external-paired' || !scopeAllowed) {
      throw new Error(`External condition ${conditionId} lacks production external provenance.`);
    }
    if (!allowed.includes(config.framework)) throw new Error(`Framework mismatch for ${conditionId}.`);
    if (config.evidenceScope === 'external-framework') externalAttestation.verifyAdapter(config);
    return;
  }
  const expected = conditionId === 'single-agent' ? 'local-baseline' : 'local-runtime';
  if (config.provenance !== expected) throw new Error(`Local provenance mismatch for ${conditionId}.`);
}

function validateConfig(config, conditionId) {
  if (!config || config.driver !== 'process-v1') throw new Error(`Missing process-v1 adapter for ${conditionId}.`);
  if (!Array.isArray(config.args) || config.args.some(value => typeof value !== 'string')) {
    throw new Error('Adapter args must be a string array.');
  }
  if (!config.adapterVersion || !config.framework) throw new Error('Adapter identity is incomplete.');
  validateArtifact(config);
  validateFramework(config, conditionId);
  if (config.cwd && !path.isAbsolute(config.cwd)) throw new Error('Adapter cwd must be absolute.');
  return config;
}

function childEnvironment(config) {
  const names = ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP'];
  const environment = Object.fromEntries(names.filter(name => process.env[name])
    .map(name => [name, process.env[name]]));
  return { ...environment, ...(config.environment || {}) };
}

function parseReceipt(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch { /* diagnostics can precede the receipt */ }
  }
  throw new Error('Adapter returned no JSON receipt.');
}

function collectOutput(state, stream, chunk) {
  state[stream] += chunk;
  if (Buffer.byteLength(state[stream], 'utf8') > MAX_OUTPUT_BYTES) {
    state.child.kill();
    state.outputExceeded = true;
  }
}

function executeProcess(input) {
  return new Promise((resolve, reject) => {
    const config = input.config;
    const child = spawn(config.command, [...config.args, config.artifactPath], {
      cwd: config.cwd || path.dirname(config.artifactPath), env: childEnvironment(config),
      windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const state = { child, stdout: '', stderr: '', outputExceeded: false };
    child.stdout.on('data', chunk => collectOutput(state, 'stdout', chunk));
    child.stderr.on('data', chunk => collectOutput(state, 'stderr', chunk));
    child.once('error', reject);
    const timer = setTimeout(() => child.kill(), input.timeoutMs);
    child.once('close', code => {
      clearTimeout(timer);
      if (state.outputExceeded) return reject(new Error('Adapter output limit exceeded.'));
      if (code !== 0) return reject(new Error(`Adapter exited ${code}: ${state.stderr.slice(-1000)}`));
      try { resolve(parseReceipt(state.stdout)); } catch (error) { reject(error); }
    });
    child.stdin.end(`${JSON.stringify(input.request)}\n`);
  });
}

function finiteMetric(receipt, field) {
  const value = Number(receipt.metrics?.[field]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Adapter metric ${field} is invalid.`);
  return value;
}

function validateReceipt(input, receipt) {
  const expected = input.request;
  if (receipt.schema !== 'genos.morphogenesis.p3-adapter-receipt/v1'
    || receipt.attemptId !== expected.attemptId || receipt.inputHash !== expected.inputHash
    || receipt.idempotencyKey !== expected.attemptId) throw new Error('Adapter receipt binding mismatch.');
  if (receipt.framework !== input.config.framework
    || receipt.adapterVersion !== input.config.adapterVersion) throw new Error('Adapter receipt identity mismatch.');
  const external = Boolean(EXTERNAL_FRAMEWORKS[expected.conditionId]);
  const requiredKind = external ? 'native-framework' : 'native-runtime';
  if (receipt.executionKind !== requiredKind) throw new Error('Adapter execution kind is not admissible.');
  if (!Object.prototype.hasOwnProperty.call(receipt, 'candidate')) throw new Error('Adapter candidate is missing.');
  return receipt;
}

async function executeProcessAdapter(input) {
  const config = validateConfig(input.config, input.request.conditionId);
  const started = process.hrtime.bigint();
  const receipt = validateReceipt({ ...input, config }, await executeProcess({ config,
    request: input.request, timeoutMs: input.request.latencyBudgetMs }));
  const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const external = Boolean(EXTERNAL_FRAMEWORKS[input.request.conditionId]);
  const attestationVerified = !external || config.evidenceScope === 'external-framework'
    && externalAttestation.verifyReceipt(config, receipt);
  const tokens = finiteMetric(receipt, 'tokens');
  finiteMetric(receipt, 'latencyMs');
  const cost = finiteMetric(receipt, 'cost');
  return { candidate: receipt.candidate, metrics: { tokens, latencyMs, cost },
    provenance: config.provenance, framework: config.framework,
    adapterVersion: config.adapterVersion, executionVerified: true,
    attestationVerified, realExecution: attestationVerified
      && config.evidenceScope !== 'test-fixture', adapterReceipt: receipt,
    budgetExceeded: tokens > input.request.budgetTokens || latencyMs > input.request.latencyBudgetMs };
}

module.exports = { executeProcessAdapter, shaFile, validateConfig };
