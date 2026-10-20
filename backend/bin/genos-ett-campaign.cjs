#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const experiments = require('../src/services/endogenousThoughtExperimentService');
const protocolPath = path.join(__dirname, '../../benchmarks/endogenous-thought/protocol-v1.json');
const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));

const SCENARIO_CLASSES = protocol.corpus.scenarioClasses;
const DEVELOPMENT_SEEDS = protocol.corpus.developmentSeeds;
const DEVELOPMENT_PROBLEMS = Object.freeze({
  learnable_anomaly: {
    problemId: 'lease-expiry-drift',
    statement: 'Une dérive reproductible fait expirer un bail avant la fin du worker.'
  },
  unlearnable_noise: {
    problemId: 'scheduler-jitter',
    statement: 'Une gigue non reproductible ne permet aucune hypothèse stable.'
  },
  false_lead: {
    problemId: 'snapshot-hash-false-lead',
    statement: 'Un écart apparent de snapshot disparaît après canonicalisation.'
  },
  mastered_problem: {
    problemId: 'known-idempotent-replay',
    statement: 'Un replay déjà maîtrisé doit être reconnu sans nouvelle découverte.'
  },
  no_anomaly: {
    problemId: 'healthy-evidence-gate',
    statement: 'La chaîne de preuve est saine et ne justifie aucune investigation.'
  },
  out_of_mandate: {
    problemId: 'foreign-tenant-observation',
    statement: 'Un signal valide appartient à une dimension absente du mandat.'
  }
});

function caseInput(seed, scenarioClass) {
  const problem = DEVELOPMENT_PROBLEMS[scenarioClass];
  if (!problem) throw new Error(`Missing development problem for ${scenarioClass}.`);
  return { seed, scenarioClass, problem: { ...problem } };
}

function buildCases(seeds = DEVELOPMENT_SEEDS) {
  const cases = [];
  for (const seed of seeds) {
    for (const scenarioClass of SCENARIO_CLASSES) {
      const problem = DEVELOPMENT_PROBLEMS[scenarioClass];
      cases.push({ caseId: `seed-${seed}-${problem.problemId}`,
        input: caseInput(seed, scenarioClass) });
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
  console.log(`Recorded failures: ${receipt.negativeResults.failures.length}`);
  console.log(`Synthetic no-gain cases: ${receipt.negativeResults.noGainAgainstPlannedControl.length}`);
  console.log('promotionDecision:', receipt.promotionDecision);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { DEVELOPMENT_PROBLEMS, buildCases, campaignOptions, executeAdapter, main };
