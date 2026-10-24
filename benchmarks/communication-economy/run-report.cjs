'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildCampaignReport } = require('./campaign.cjs');

function readTrials(inputPath) {
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(payload.trials)) throw new Error('Input JSON must contain a trials array.');
  return payload.trials;
}

function writeReport(report, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

function main(args = process.argv.slice(2)) {
  if (!args[0]) throw new Error('Usage: node run-report.cjs <matched-trials.json> [report.json]');
  const inputPath = path.resolve(args[0]);
  const outputPath = path.resolve(args[1] || 'benchmarks/communication-economy/results/report.json');
  const report = buildCampaignReport(readTrials(inputPath));
  writeReport(report, outputPath);
  console.log(`Campaign report: ${outputPath}`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`CAMPAIGN REPORT FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
