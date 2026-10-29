#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCIENTIFIC_CAMPAIGN = require('../../backend/src/services/endogenousThoughtScientificCampaignService');

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === '--adapter' || key === '--output') values[key.slice(2)] = args[++index];
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!values.adapter || !values.output) throw new Error('Usage: run_campaign.js --adapter <module.js> --output <receipt.json>');
  return values;
}

function loadAdapter(filename) {
  const resolved = path.resolve(filename);
  if (!fs.existsSync(resolved)) throw new Error(`Provider module not found: ${resolved}`);
  return require(resolved);
}

function requiredScenarioPairs() {
  const root = path.join(__dirname, 'scenarios');
  const levels = ['simple', 'difficult', 'open'];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const directory = entry.name;
    const scenario = JSON.parse(fs.readFileSync(path.join(root, directory, 'scenario.json'), 'utf8'));
    return levels.map((level) => `${scenario.id}:${level}`);
  });
}

function validateCoverage(adapter) {
  if (!Array.isArray(adapter.replications) || adapter.replications.length < 30) {
    throw new Error('Campaign requires at least 30 independent replications.');
  }
  const available = new Set((adapter.cases || []).map((item) => `${item.scenarioId}:${item.difficulty}`));
  const missing = requiredScenarioPairs().filter((pair) => !available.has(pair));
  if (missing.length) throw new Error(`Provider module lacks scenario coverage: ${missing.join(', ')}`);
}

function validateAdapter(adapter) {
  const required = ['protocol', 'metricSet', 'runtime', 'providers', 'replications', 'cases'];
  const missing = required.filter((key) => adapter[key] === undefined);
  if (missing.length) throw new Error(`Provider module is missing: ${missing.join(', ')}`);
  if (adapter.protocol?.corpus?.reserved?.availableForTuning !== false) {
    throw new Error('Adapter protocol must declare the reserved corpus unavailable for tuning.');
  }
  validateCoverage(adapter);
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const adapter = loadAdapter(options.adapter);
  validateAdapter(adapter);
  const receipt = await SCIENTIFIC_CAMPAIGN.runScientificCampaign(adapter);
  const output = path.resolve(options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Descriptive receipt written: ${output}\n`);
  return receipt;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.code || 'ETT_CAMPAIGN_FAILED'}: ${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { parseArguments, requiredScenarioPairs, validateAdapter, main };
