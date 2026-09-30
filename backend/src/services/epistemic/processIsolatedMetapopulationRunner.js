'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const WORKER = path.join(__dirname, 'isolatedPopulationWorker.cjs');
const MAX_OUTPUT_BYTES = 1024 * 1024;

function safeEnvironment(population) {
  const base = { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '' };
  return { ...base, ...(population.environment || {}) };
}

function runPopulation(population) {
  if (!population?.model || !population.provider || !population.prompt) {
    return Promise.reject(Object.assign(new Error('Population requires provider, model and independent prompt.'), { code: 'AEIS_POPULATION_INPUT_INVALID' }));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER], { env: safeEnvironment(population), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), Math.min(Number(population.timeoutMs) || 90000, 120000));
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > MAX_OUTPUT_BYTES) child.kill(); });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(Object.assign(new Error(stderr || 'Population worker failed.'), { code: 'AEIS_POPULATION_WORKER_FAILED' }));
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(Object.assign(error, { code: 'AEIS_POPULATION_RESULT_INVALID' })); }
    });
    child.stdin.end(JSON.stringify({ provider: population.provider, model: population.model, endpoint: population.endpoint, prompt: population.prompt, timeoutMs: population.timeoutMs, maxTokens: population.maxTokens }));
  });
}

async function runIsolatedPopulations(populations) {
  return Promise.all((populations || []).map((population) => runPopulation(population).catch((error) => ({ provider: population.provider, error: error.message, status: 'error' }))));
}

module.exports = { runPopulation, runIsolatedPopulations };
