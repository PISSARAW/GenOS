#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { LEVELS, validateProposal } = require('./scenarios/runtime');
const { SYSTEM_IDS, createAdapter } = require('./adapters/referenceSystems');

function loadScenarios() {
  const root = path.join(__dirname, 'scenarios');
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => require(path.join(root, entry.name, 'scenario.js')))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function optionsFrom(args) {
  const options = { seeds: 30, output: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--seeds') options.seeds = Number(args[++index]);
    else if (args[index] === '--output') options.output = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!Number.isSafeInteger(options.seeds) || options.seeds < 1 || !options.output) {
    throw new Error('Usage: node benchmarks/ett/run_reference_campaign.js --seeds <n> --output <new-file.json>');
  }
  return options;
}

function verifyIndependently(checks) {
  const worker = path.join(__dirname, 'evaluation/oracle_worker.js');
  const result = spawnSync(process.execPath, [worker], {
    input: JSON.stringify(checks), encoding: 'utf8', timeout: 5000
  });
  if (result.status !== 0) throw new Error(`Oracle process failed: ${result.stderr || result.error}`);
  return JSON.parse(result.stdout);
}

async function runCampaign(seeds) {
  const scenarios = loadScenarios();
  const runs = SYSTEM_IDS.map((id) => ({ id, adapter: createAdapter(id), cases: [] }));
  for (const seed of seeds) {
    for (const scenario of scenarios) {
      const scenarioId = scenario.id;
      for (const difficulty of LEVELS) {
        const testCase = scenario.build(difficulty, seed);
        const checks = [];
        for (const run of runs) {
          const started = process.hrtime.bigint();
          try {
            const proposal = await run.adapter.solve({ scenarioId, difficulty, seed,
              observation: testCase.observation, budget: testCase.budget });
            if (!validateProposal(proposal)) throw new Error('Adapter proposal schema invalid.');
            checks.push({ expected: testCase.oracle, proposal });
            run.cases.push({ scenarioId, difficulty, seed, failed: false, proposal,
              elapsedMs: Number(process.hrtime.bigint() - started) / 1e6 });
          } catch (error) {
            checks.push({ expected: testCase.oracle, proposal: null });
            run.cases.push({ scenarioId, difficulty, seed, failed: true, error: error.message });
          }
        }
        const verifications = verifyIndependently(checks);
        runs.forEach((run, index) => Object.assign(run.cases.at(-1), verifications[index]));
      }
    }
  }
  return runs.map((run) => {
    const rows = run.cases.map((item) => ({ systemId: run.id, ...item,
      actions: item.proposal?.actions }));
    const successes = rows.filter((row) => row.usefulDiscoveries > 0).length;
    return { id: run.id, disclosure: run.adapter.disclosure, attempted: rows.length,
      verifiedDiscoveries: successes, successRate: successes / rows.length,
      executionFailures: rows.filter((row) => row.failed).length, rows };
  });
}

async function main(args = process.argv.slice(2)) {
  const options = optionsFrom(args);
  const seeds = Array.from({ length: options.seeds }, (_, index) => 1001 + index * 7919);
  const systems = await runCampaign(seeds);
  const receipt = {
    schema: 'genos.ett-reference-campaign/v1', status: 'executable_local_reference_only',
    scientificClaimAllowed: false, externalModelCostsMeasured: false,
    oracleIsolation: 'separate-child-process', scenarios: loadScenarios().map(({ id }) => id),
    difficulties: LEVELS, seeds, systems
  };
  const output = path.resolve(options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Reference receipt written: ${output}\n`);
  return receipt;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`ETT_REFERENCE_FAILED: ${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { optionsFrom, loadScenarios, verifyIndependently, runCampaign, main };
