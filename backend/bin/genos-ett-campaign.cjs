#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const experiments = require('../src/services/endogenousThoughtExperimentService');
const protocolPath = path.join(__dirname, '../../benchmarks/endogenous-thought/protocol-v1.json');
const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));

const SCENARIO_CLASSES = protocol.corpus.scenarioClasses;
const DEV_SEEDS = protocol.corpus.developmentSeeds;

function buildCases() {
  const cases = [];
  for (const seed of DEV_SEEDS) {
    for (const scenarioClass of SCENARIO_CLASSES) {
      cases.push({ caseId: `seed-${seed}-${scenarioClass}`, input: { seed, scenarioClass } });
    }
  }
  return cases;
}

// Placeholder adapter: a real implementation must invoke the full ETT chain
// (detection -> admission -> queue -> runner -> verification -> learning -> continuation)
// under the given condition and return measured metrics. This scaffold keeps the
// campaign descriptive and non-promoting.
async function executeAdapter({ caseId, input, condition }) {
  const base = condition === 'full' ? 1 : 0.5;
  return {
    success: true,
    episodes: 1,
    verifiedDiscoveries: condition === 'full' ? 1 : 0,
    normalizedCost: 1,
    budgetViolations: 0,
    duplicates: 0,
    score: base,
    caseId,
    seed: input.seed,
    scenarioClass: input.scenarioClass
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;

  const receipt = await experiments.run({
    agentId: 'ett-campaign-agent',
    snapshot: { seeds: DEV_SEEDS },
    environment: { model: 'deterministic', dependencies: [], toolLease: 'ett-campaign' },
    cases: buildCases(),
    protocol,
    holdout: true,
    execute: executeAdapter
  });

  const serialized = JSON.stringify(receipt, null, 2);
  if (outputPath) {
    fs.writeFileSync(outputPath, serialized);
    console.log(`ETT campaign receipt written to ${outputPath}`);
  } else {
    console.log(serialized);
  }
  console.log(`Seeds: ${DEV_SEEDS.join(', ')}`);
  console.log(`Scenario classes: ${SCENARIO_CLASSES.join(', ')}`);
  console.log(`Conditions: ${receipt.conditions.join(', ')}`);
  console.log('promotionDecision:', receipt.promotionDecision);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});