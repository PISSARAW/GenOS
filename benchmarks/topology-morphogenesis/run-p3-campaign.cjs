'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runPairedCampaignPhase } = require('../../backend/src/services/morphogenesis/synthesis/pairedCampaignRunner');
const { loadExternalOracle } = require('./externalComparisonOracle.cjs');

function parseArgs(args) {
  const options = { config: null, phase: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--config') options.config = args[++index];
    else if (args[index] === '--phase') options.phase = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!options.config || !['shadow', 'holdout'].includes(options.phase)) {
    throw new Error('Usage: node run-p3-campaign.cjs --config <file> --phase shadow|holdout');
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolvedPath(base, value) {
  if (!value) throw new Error('P3 runtime path is missing.');
  return path.resolve(base, value);
}

function resolveAdapter(base, adapter) {
  return { ...adapter, command: resolvedPath(base, adapter.command),
    artifactPath: resolvedPath(base, adapter.artifactPath),
    cwd: adapter.cwd ? resolvedPath(base, adapter.cwd) : undefined };
}

function loadRuntime(options) {
  const configFile = path.resolve(options.config);
  const base = path.dirname(configFile);
  const config = readJson(configFile);
  if (config.schema !== 'genos.morphogenesis.p3-runtime-config/v1') {
    throw new Error('Unsupported P3 runtime config schema.');
  }
  const manifestFile = resolvedPath(base, config.manifest);
  const datasetFile = resolvedPath(base, config.datasets?.[options.phase]);
  const adapters = Object.fromEntries(Object.entries(config.adapters || {})
    .map(([condition, adapter]) => [condition, resolveAdapter(base, adapter)]));
  return { manifest: readJson(manifestFile), dataset: readJson(datasetFile), datasetFile,
    adapters, storeRoot: resolvedPath(base, config.storeRoot) };
}

function oracleEvaluator(runtime) {
  const cache = new Map();
  for (const task of runtime.dataset.tasks || []) {
    cache.set(task.taskId, loadExternalOracle(task, runtime.datasetFile,
      runtime.dataset.trainingOracleIds || []).verify);
  }
  return async input => {
    const verdict = cache.get(input.task.taskId)(input.candidate);
    const score = Number.isFinite(Number(verdict.score)) ? Number(verdict.score) : verdict.passed ? 1 : 0;
    return { verified: true, score, details: verdict };
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const runtime = loadRuntime(options);
    const result = await runPairedCampaignPhase({ ...runtime, phase: options.phase,
      oracleEvaluator: oracleEvaluator(runtime) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { loadRuntime, oracleEvaluator, parseArgs };
