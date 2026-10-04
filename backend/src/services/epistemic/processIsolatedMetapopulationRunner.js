'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const WORKER = path.join(__dirname, 'isolatedPopulationWorker.cjs');
const MAX_OUTPUT_BYTES = 1024 * 1024;
const PROVIDER_KEYS = Object.freeze({
  openai: ['OPENAI_API_KEY', 'GENOS_MODEL_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'], gemini: ['GEMINI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], groq: ['GROQ_API_KEY', 'GENOS_MODEL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'GENOS_MODEL_API_KEY'],
  together: ['TOGETHER_API_KEY', 'GENOS_MODEL_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'GENOS_MODEL_API_KEY'],
});

function safeEnvironment(population) {
  const base = { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '',
    GENOS_DISABLE_DOTENV: '1' };
  for (const key of PROVIDER_KEYS[population.provider] || []) {
    if (process.env[key]) base[key] = process.env[key];
  }
  return base;
}

function runPopulation(population) {
  if (!population?.model || !population.provider || !population.prompt) {
    return Promise.reject(Object.assign(new Error('Population requires provider, model and independent prompt.'), { code: 'AEIS_POPULATION_INPUT_INVALID' }));
  }
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ['--max-old-space-size=128', WORKER], {
      env: safeEnvironment(population), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), Math.min(Number(population.timeoutMs) || 90000, 120000));
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > MAX_OUTPUT_BYTES) child.kill(); });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > MAX_OUTPUT_BYTES) child.kill(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(Object.assign(new Error('Population worker failed.'), { code: 'AEIS_POPULATION_WORKER_FAILED' }));
      try { resolve({ ...JSON.parse(stdout), processId: child.pid, durationMs: Date.now() - startedAt }); }
      catch (error) { reject(Object.assign(error, { code: 'AEIS_POPULATION_RESULT_INVALID' })); }
    });
    child.stdin.end(JSON.stringify({ provider: population.provider, model: population.model, endpoint: population.endpoint, prompt: population.prompt, timeoutMs: population.timeoutMs, maxTokens: population.maxTokens }));
  });
}

async function runIsolatedPopulations(populations) {
  return Promise.all((populations || []).map((population) => runPopulation(population).catch((error) => ({ provider: population.provider, error: error.message, status: 'error' }))));
}

module.exports = { runPopulation, runIsolatedPopulations, safeEnvironment };
