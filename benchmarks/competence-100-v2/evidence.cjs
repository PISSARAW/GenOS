'use strict';

const fs = require('node:fs');
const path = require('node:path');
const legacy = require('../competence-100/evidence.cjs');
const { hash } = require('../competence-100/corpus.cjs');

function sourceHashes() {
  const local = fs.readdirSync(__dirname).filter(name => /\.(cjs|json)$/.test(name))
    .map(name => 'benchmarks/competence-100-v2/' + name);
  const learned = fs.readdirSync(path.join(legacy.ROOT, 'backend/src/services/experienceCompetence'))
    .map(name => 'backend/src/services/experienceCompetence/' + name);
  const production = ['metacognitiveForecastService.js', 'metacognitiveForecastStore.js',
    'metacognitionBenchService.js', 'proceduralConsolidationService.js', 'proceduralPredictionErrorService.js',
    'proceduralGenomePolicyService.js', 'proceduralPlasticityService.js', 'adaptiveStateService.js',
    'abstentionService.js', 'epistemicVerifierReceiptService.js'].map(name => 'backend/src/services/' + name);
  return { ...legacy.sourceHashes(), ...Object.fromEntries([...local, ...learned, ...production]
    .map(name => [name, hash(fs.readFileSync(path.join(legacy.ROOT, name), 'utf8'))])) };
}

async function describe(model) {
  if (model.includes(':cloud')) throw Error('Local model required');
  const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
  const found = (await response.json()).models.find(row => row.name === model);
  if (!found?.digest) throw Error('Installed model unavailable');
  return { name: model, digest: found.digest, provider: 'ollama-local', endpoint: 'http://127.0.0.1:11434' };
}

const budgetValid = (result, model) => result.model === model.name && result.valid
  && Number.isInteger(result.inputTokens) && result.inputTokens <= 4096
  && Number.isInteger(result.outputTokens) && result.outputTokens <= 192;

module.exports = { ...legacy, sourceHashes, describe, budgetValid };
