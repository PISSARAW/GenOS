#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runCampaign } = require('../run_reference_campaign');

function parseArguments(args) {
  const options = { input: null, output: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--input') options.input = args[++index];
    else if (args[index] === '--output') options.output = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!options.input || !options.output) {
    throw new Error('Usage: node benchmarks/ett/evaluation/replay.js --input <receipt.json> --output <new-replay.json>');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function replayComparable(row) {
  return { scenarioId: row.scenarioId, difficulty: row.difficulty, seed: row.seed,
    failed: row.failed, proposal: row.proposal || null, verdict: row.verdict || null,
    usefulDiscoveries: row.usefulDiscoveries || 0, actions: row.actions ?? null };
}

function compareRows(expected, actual) {
  let mismatches = 0;
  let firstMismatch = null;
  const count = Math.max(expected.length, actual.length);
  for (let index = 0; index < count; index += 1) {
    if (JSON.stringify(replayComparable(expected[index] || {}))
      === JSON.stringify(replayComparable(actual[index] || {}))) continue;
    mismatches += 1;
    if (!firstMismatch) firstMismatch = { index, expected: expected[index] || null,
      replayed: actual[index] || null };
  }
  return { expectedRows: expected.length, replayedRows: actual.length, mismatches, firstMismatch };
}

function compareSystems(expectedSystems, replayedSystems) {
  const actualById = new Map(replayedSystems.map((system) => [system.id, system]));
  const checks = expectedSystems.map((system) => {
    const actual = actualById.get(system.id);
    return { systemId: system.id, missing: !actual,
      rows: compareRows(system.rows || [], actual?.rows || []) };
  });
  const unexpectedSystems = replayedSystems.filter((system) =>
    !expectedSystems.some((expected) => expected.id === system.id)).map((system) => system.id);
  return { checks, unexpectedSystems,
    mismatches: checks.reduce((sum, item) => sum + item.rows.mismatches + Number(item.missing), 0)
      + unexpectedSystems.length };
}

async function createReplayReceipt(options) {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  if (inputPath === outputPath || fs.existsSync(outputPath)) {
    throw new Error('Replay output must be a new file distinct from its source report.');
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const source = JSON.parse(raw);
  if (source.schema !== 'genos.ett-reference-campaign/v1'
    || !Array.isArray(source.seeds) || !Array.isArray(source.systems)) {
    throw new Error('Replay input must be an ETT reference-campaign receipt.');
  }
  const replayed = await runCampaign(source.seeds);
  const comparison = compareSystems(source.systems, replayed);
  const receipt = { schema: 'genos.ett-replay/v1', status: comparison.mismatches === 0
    ? 'deterministic_reference_replay_verified' : 'deterministic_reference_replay_mismatch',
  sourceReport: inputPath, sourceReportSha256: sha256(raw), sourceStatus: source.status,
  seeds: source.seeds, scenarioCount: source.scenarios.length,
  systemCount: source.systems.length, comparison, replayedAt: new Date().toISOString(),
  scientificClaimAllowed: false,
  scope: 'Deterministic reference policies and oracle replay only; no LLM results or scientific qualification.' };
  writeReceipt(outputPath, receipt);
  return receipt;
}

function writeReceipt(filename, receipt) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filename);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const receipt = await createReplayReceipt(options);
  process.stdout.write(JSON.stringify({ status: receipt.status,
    output: path.resolve(options.output), mismatches: receipt.comparison.mismatches }) + '\n');
  return receipt;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`ETT_REPLAY_FAILED: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { parseArguments, replayComparable, compareRows, compareSystems,
  createReplayReceipt, main };
