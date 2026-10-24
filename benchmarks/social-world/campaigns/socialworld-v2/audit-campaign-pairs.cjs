'use strict';

const fs = require('node:fs');
const path = require('node:path');

function expectedArms(manifest, scenarioId) {
  const arms = [...manifest.arms];
  if (['V2-03', 'V2-04'].includes(scenarioId)) {
    return arms.filter((arm) => arm !== 'genos-without-relational-physiology');
  }
  return arms;
}

function comparisonKey(report) {
  const input = report.inputs && report.inputs.comparison;
  if (!input) return null;
  return JSON.stringify([input.eventsHash, input.budgetHash, input.permissionsHash]);
}

function checkGroup(group, arms, seed) {
  const errors = [];
  const byArm = new Map();
  for (const report of group) {
    if (byArm.has(report.arm)) errors.push(`duplicate report for seed ${seed}, arm ${report.arm}`);
    byArm.set(report.arm, report);
  }
  for (const arm of arms) if (!byArm.has(arm)) errors.push(`missing arm ${arm} for seed ${seed}`);
  if (errors.length) return errors;
  const keys = new Set(group.map(comparisonKey));
  if (keys.has(null)) errors.push(`missing paired events, budget, or permissions hashes for seed ${seed}`);
  if (keys.size > 1) errors.push(`causal inputs differ across arms for seed ${seed}`);
  return errors;
}

function auditCampaign(manifest, reports) {
  const errors = [];
  const scenarios = new Set(manifest.scenarios.map((scenario) => scenario.id));
  const seeds = new Set(manifest.seeds);
  const groups = new Map();
  for (const report of reports) {
    if (!scenarios.has(report.scenario) || !seeds.has(report.seed)) {
      errors.push(`unexpected scenario or seed: ${report.scenario}/${report.seed}`);
      continue;
    }
    const key = `${report.scenario}/${report.seed}`;
    groups.set(key, [...(groups.get(key) || []), report]);
  }
  for (const scenario of manifest.scenarios) {
    for (const seed of seeds) {
      const key = `${scenario.id}/${seed}`;
      errors.push(...checkGroup(groups.get(key) || [], expectedArms(manifest, scenario.id), seed));
    }
  }
  return { status: errors.length ? 'inconclusive' : 'paired', errors };
}

function main() {
  const manifestPath = process.argv[2];
  const reportDirectory = process.argv[3];
  if (!manifestPath || !reportDirectory) throw new Error('Usage: node audit-campaign-pairs.cjs <manifest.json> <report-directory>');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const reports = fs.readdirSync(reportDirectory).filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(reportDirectory, file), 'utf8')));
  const result = auditCampaign(manifest, reports);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'paired') process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { auditCampaign, expectedArms };
