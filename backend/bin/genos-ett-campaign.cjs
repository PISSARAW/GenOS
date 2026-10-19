#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const experiments = require('../src/services/endogenousThoughtExperimentService');
const protocolPath = path.join(__dirname, '../../benchmarks/endogenous-thought/protocol-v1.json');
const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));

const SCENARIO_CLASSES = protocol.corpus.scenarioClasses;
const DEVELOPMENT_SEEDS = protocol.corpus.developmentSeeds;

function buildCases(seeds = DEVELOPMENT_SEEDS) {
  const cases = [];
  for (const seed of seeds) {
    for (const scenarioClass of SCENARIO_CLASSES) {
      cases.push({ caseId: `seed-${seed}-${scenarioClass}`, input: { seed, scenarioClass } });
    }
  }
  return cases;
}

const campaignExecutor = require('../src/services/endogenousThoughtCampaignExecutor');

async function executeAdapter({ caseId, input, condition }) {
  return campaignExecutor.execute({ caseId, input, condition });
}

function campaignOptions() {
  return {
    agentId: 'ett-campaign-agent',
    snapshot: { seeds: DEVELOPMENT_SEEDS, corpusSplit: 'development' },
    environment: { model: 'deterministic', dependencies: [], toolLease: 'ett-campaign' },
    cases: buildCases(),
    protocol,
    holdout: false,
    execute: executeAdapter
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;

  const receipt = await experiments.run(campaignOptions());

  const serialized = JSON.stringify(receipt, null, 2);
  if (outputPath) {
    fs.writeFileSync(outputPath, serialized);
    console.log(`ETT campaign receipt written to ${outputPath}`);
  } else {
    console.log(serialized);
  }
  console.log('Corpus: development (not holdout)');
  console.log(`Seeds: ${DEVELOPMENT_SEEDS.join(', ')}`);
  console.log(`Scenario classes: ${SCENARIO_CLASSES.join(', ')}`);
  console.log(`Conditions: ${receipt.conditions.join(', ')}`);
  console.log('promotionDecision:', receipt.promotionDecision);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildCases, campaignOptions, executeAdapter, main };
