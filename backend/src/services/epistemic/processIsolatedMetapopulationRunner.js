'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const WORKER = path.join(__dirname, 'isolatedPopulationWorker.cjs');
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_POPULATIONS = 8;
const PROVIDER_KEYS = Object.freeze({
  openai: ['OPENAI_API_KEY', 'GENOS_MODEL_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'], gemini: ['GEMINI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], groq: ['GROQ_API_KEY', 'GENOS_MODEL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'GENOS_MODEL_API_KEY'],
  together: ['TOGETHER_API_KEY', 'GENOS_MODEL_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'GENOS_MODEL_API_KEY'],
  'openai-compatible': ['GENOS_MODEL_API_KEY', 'OPENAI_API_KEY'],
});

function safeEnvironment(population) {
  const base = { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '',
    GENOS_DISABLE_DOTENV: '1', GENOS_DB_PATH: ':memory:', GENOS_DB_BACKUP_SKIP: '1' };
  if (process.env.NODE_PATH) base.NODE_PATH = process.env.NODE_PATH;
  for (const key of PROVIDER_KEYS[population.provider] || []) {
    if (process.env[key]) base[key] = process.env[key];
  }
  return base;
}

function runPopulation(population) {
  if (!validPopulation(population)) {
    return Promise.reject(Object.assign(new Error('Population requires provider, model and independent prompt.'), { code: 'AEIS_POPULATION_INPUT_INVALID' }));
  }
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ['--max-old-space-size=128', WORKER], {
      env: safeEnvironment(population), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let failureCode = null;
    const timeoutMs = boundedNumber(population.timeoutMs, 30000, 120000);
    const terminate = (code) => { failureCode = code; child.kill(); };
    const timer = setTimeout(() => terminate('AEIS_POPULATION_TIMEOUT'), timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (Buffer.byteLength(stdout) + chunk.length > MAX_OUTPUT_BYTES) return terminate('AEIS_POPULATION_OUTPUT_LIMIT');
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (Buffer.byteLength(stderr) + chunk.length > MAX_OUTPUT_BYTES) return terminate('AEIS_POPULATION_OUTPUT_LIMIT');
      stderr += chunk;
    });
    child.stdin.on('error', () => terminate('AEIS_POPULATION_WORKER_FAILED'));
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failureCode || code !== 0) return reject(Object.assign(new Error('Population worker failed.'), { code: failureCode || 'AEIS_POPULATION_WORKER_FAILED' }));
      try { resolve({ ...JSON.parse(stdout), processId: child.pid, durationMs: Date.now() - startedAt }); }
      catch (error) { reject(Object.assign(error, { code: 'AEIS_POPULATION_RESULT_INVALID' })); }
    });
    child.stdin.end(JSON.stringify({ provider: population.provider, model: population.model,
      endpoint: population.endpoint, prompt: population.prompt, timeoutMs,
      maxTokens: boundedNumber(population.maxTokens, 400, 4096) }));
  });
}

async function runIsolatedPopulations(populations) {
  if (!Array.isArray(populations) || populations.length > MAX_POPULATIONS) {
    throw Object.assign(new Error('AEIS requires at most eight process-isolated populations.'), { code: 'AEIS_POPULATION_LIMIT' });
  }
  return Promise.all(populations.map((population) => runPopulation(population).catch((error) => ({
    provider: population?.provider, error: error.message, errorCode: error.code, status: 'error',
  }))));
}

function boundedNumber(value, fallback, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.min(Math.floor(number), maximum)) : fallback;
}

function validPopulation(population) {
  if (typeof population?.provider !== 'string' || typeof population.model !== 'string') return false;
  const prefix = `${population.provider}://`;
  if (!population.model.startsWith(prefix) || population.model.length > 512) return false;
  if (!population.model.slice(prefix.length).trim()) return false;
  return typeof population.prompt === 'string' && population.prompt.trim().length > 0
    && Buffer.byteLength(population.prompt) <= 65536;
}

module.exports = { runPopulation, runIsolatedPopulations, safeEnvironment };
