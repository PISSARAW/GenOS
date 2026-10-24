'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildCampaignReport } = require('./campaign.cjs');
const { importAgentSocietyTrace, importGenosTrace } = require('./trace-adapter.cjs');

function importEntry(entry, manifestDirectory) {
  const text = fs.readFileSync(path.resolve(manifestDirectory, entry.tracePath), 'utf8');
  const expected = { ...entry, taskIds: entry.taskIds };
  if (entry.sourceSystem === 'agentsociety') return importAgentSocietyTrace(text, expected);
  if (entry.sourceSystem === 'genos') return importGenosTrace(text, expected);
  throw new Error(`Unsupported trace source '${entry.sourceSystem}'.`);
}

function runCampaign(manifestPath, outputPath) {
  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf8'));
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) {
    throw new Error('Campaign manifest must contain trace entries.');
  }
  const trials = manifest.entries.map((entry) => importEntry(entry, path.dirname(absoluteManifest)));
  const report = buildCampaignReport(trials);
  const target = path.resolve(outputPath || 'benchmarks/communication-economy/results/campaign.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ ...report, campaignId: manifest.campaignId }, null, 2));
  return target;
}

if (require.main === module) {
  try {
    const output = runCampaign(process.argv[2], process.argv[3]);
    console.log(`Campaign report: ${output}`);
  } catch (error) {
    console.error(`CAMPAIGN FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { runCampaign };
