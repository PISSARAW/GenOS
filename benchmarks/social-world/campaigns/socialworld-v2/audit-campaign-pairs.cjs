'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateReport } = require('./validate-report.cjs');

const HASH_FIELDS = ['eventsHash', 'budgetHash', 'permissionsHash'];
const VALID_STATUSES = ['pass', 'fail', 'inconclusive'];

function uniqueStrings(values) {
  return Array.isArray(values) && values.length > 0
    && values.every((value) => typeof value === 'string' && value.trim())
    && new Set(values).size === values.length;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be an object'];
  }
  const errors = [];
  validateManifestMetadata(manifest, errors);
  validateManifestScenarios(manifest, errors);
  return errors;
}

function validateManifestMetadata(manifest, errors) {
  if (typeof manifest.campaignId !== 'string' || !manifest.campaignId.trim()) errors.push('manifest campaignId is required');
  if (!uniqueStrings(manifest.seeds)) errors.push('manifest seeds must be unique non-empty strings');
  if (!uniqueStrings(manifest.arms)) errors.push('manifest arms must be unique non-empty strings');
  validateStatuses(manifest, errors);
}

function validateManifestScenarios(manifest, errors) {
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    errors.push('manifest scenarios must be a non-empty array');
    return;
  }
  const scenarioIds = manifest.scenarios.map((scenario) => scenario && scenario.id);
  if (!uniqueStrings(scenarioIds)) errors.push('manifest scenario ids must be unique non-empty strings');
  if (!manifest.comparisonArms || typeof manifest.comparisonArms !== 'object') {
    errors.push('manifest comparisonArms is required');
    return;
  }
  validateScenarioArms(manifest, scenarioIds, errors);
}

function validateStatuses(manifest, errors) {
  if (!uniqueStrings(manifest.allowedStatuses)) {
    errors.push('manifest allowedStatuses must be unique non-empty strings');
  } else if (manifest.allowedStatuses.some((status) => !VALID_STATUSES.includes(status))) {
    errors.push('manifest allowedStatuses contains an invalid status');
  }
}

function validateScenarioArms(manifest, scenarioIds, errors) {
  for (const scenarioId of scenarioIds) {
    const arms = manifest.comparisonArms[scenarioId];
    if (!uniqueStrings(arms)) {
      errors.push(`comparison arms must be unique non-empty strings for ${scenarioId}`);
      continue;
    }
    for (const arm of arms) {
      if (!manifest.arms.includes(arm)) errors.push(`unknown comparison arm ${arm} for ${scenarioId}`);
    }
  }
  for (const scenarioId of Object.keys(manifest.comparisonArms)) {
    if (!scenarioIds.includes(scenarioId)) errors.push(`unexpected comparison scenario ${scenarioId}`);
  }
}

function expectedArms(manifest, scenarioId) {
  return manifest.comparisonArms[scenarioId];
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function comparisonKey(report) {
  const comparison = report.inputs && report.inputs.comparison;
  if (!comparison || !HASH_FIELDS.every((field) => isSha256(comparison[field]))) return null;
  return HASH_FIELDS.map((field) => comparison[field].toLowerCase()).join(':');
}

function validateRunRecord(record, manifest, repositoryRoot) {
  if (!record || typeof record !== 'object' || !record.report || typeof record.report !== 'object') {
    return ['report record must contain a JSON object'];
  }
  const { report, reportPath } = record;
  if (!reportPath || !path.isAbsolute(reportPath)) return ['reportPath must be an absolute path'];
  const errors = validateReport(report, reportPath, repositoryRoot);
  validateReportIdentity(report, manifest, errors);
  if (!comparisonKey(report)) errors.push('comparison hashes must be non-empty SHA-256 values');
  return errors;
}

function validateReportIdentity(report, manifest, errors) {
  if (report.campaignId !== manifest.campaignId) errors.push('report campaignId does not match manifest');
  const scenario = manifest.scenarios.find((item) => item.id === report.scenario);
  if (!scenario) errors.push(`unexpected scenario: ${report.scenario}`);
  if (!manifest.seeds.includes(report.seed)) errors.push(`unexpected seed: ${report.seed}`);
  if (scenario && !expectedArms(manifest, scenario.id).includes(report.arm)) {
    errors.push(`unexpected arm ${report.arm} for ${report.scenario}`);
  }
  if (report.status && !manifest.allowedStatuses.includes(report.status)) {
    errors.push(`unexpected report status: ${report.status}`);
  }
}

function checkGroup(group, arms, seed) {
  const context = { seed, arms, errors: [] };
  const byArm = collectArms(group, arms, context);
  for (const arm of arms) if (!byArm.has(arm)) context.errors.push(`missing arm ${arm} for seed ${seed}`);
  if (!context.errors.length) validatePairedHashes(group, seed, context.errors);
  return context.errors;
}

function collectArms(group, arms, context) {
  const byArm = new Map();
  for (const record of group) {
    const arm = record.report.arm;
    if (!recordedArmAllowed(context, arm)) {
      continue;
    }
    if (byArm.has(arm)) context.errors.push(`duplicate report or attempt for seed ${context.seed}, arm ${arm}`);
    byArm.set(arm, record);
  }
  return byArm;
}

function recordedArmAllowed(context, arm) {
  if (context.arms && context.arms.includes(arm)) return true;
  context.errors.push(`unexpected arm ${arm} for seed ${context.seed}`);
  return false;
}

function validatePairedHashes(group, seed, errors) {
  const keys = new Set(group.map((record) => comparisonKey(record.report)));
  if (keys.has(null)) errors.push(`missing paired events, budget, or permissions hashes for seed ${seed}`);
  if (keys.size > 1) errors.push(`causal inputs differ across arms for seed ${seed}`);
}

function collectRecords(records, manifest, repositoryRoot) {
  const errors = [];
  const groups = new Map();
  for (const record of records) {
    const validationErrors = validateRunRecord(record, manifest, repositoryRoot);
    errors.push(...validationErrors);
    if (!record || typeof record !== 'object' || !record.report || typeof record.report !== 'object') continue;
    const report = record.report;
    const key = `${report.scenario}/${report.seed}`;
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  return { groups, errors };
}

function inspectEveryPair(manifest, groups, errors) {
  for (const scenario of manifest.scenarios) {
    for (const seed of manifest.seeds) {
      const key = `${scenario.id}/${seed}`;
      errors.push(...checkGroup(groups.get(key) || [], expectedArms(manifest, scenario.id), seed));
    }
  }
  return errors;
}

function statusCounts(records) {
  return records.reduce((counts, record) => {
    const status = record && record.report && typeof record.report.status === 'string'
      ? record.report.status : 'invalid';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function auditCampaign(manifest, records, repositoryRoot) {
  const errors = validateManifest(manifest);
  if (errors.length) return { status: 'inconclusive', campaignConclusion: 'not-assessed', errors };
  if (!Array.isArray(records)) return {
    status: 'inconclusive', campaignConclusion: 'not-assessed', errors: ['report records must be an array']
  };
  const collected = collectRecords(records, manifest, repositoryRoot);
  inspectEveryPair(manifest, collected.groups, collected.errors);
  return {
    status: collected.errors.length ? 'inconclusive' : 'paired',
    campaignConclusion: 'not-assessed',
    reportStatusCounts: statusCounts(records),
    errors: collected.errors
  };
}

function isEvidenceFile(filename) {
  return filename.toLowerCase() === 'evidence.json' || /(?:[.-])evidence\.json$/i.test(filename);
}

function readReportFiles(reportDirectory) {
  const records = [];
  const errors = [];
  try {
    const files = fs.readdirSync(reportDirectory).filter((filename) => filename.endsWith('.json')
      && !isEvidenceFile(filename));
    for (const filename of files) readReportFile(reportDirectory, filename, { records, errors });
  } catch (error) {
    errors.push(`cannot read report directory: ${error.message}`);
  }
  return { records, errors };
}

function readReportFile(directory, filename, output) {
  const reportPath = path.join(directory, filename);
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (isDiagnosticPilot(report)) return;
    output.records.push({ report, reportPath });
  } catch (error) {
    output.errors.push(`cannot read report ${filename}: ${error.message}`);
  }
}

function isDiagnosticPilot(report) {
  return report?.scenario === 'V2-03' && report.campaignDisposition === 'diagnostic-pilot';
}

function main() {
  const manifestPath = process.argv[2];
  const reportDirectory = process.argv[3];
  if (!manifestPath || !reportDirectory) {
    process.stderr.write('Usage: node audit-campaign-pairs.cjs <manifest.json> <report-directory>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const loaded = readReportFiles(reportDirectory);
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const result = auditCampaign(manifest, loaded.records, repositoryRoot);
    result.errors.push(...loaded.errors);
    if (loaded.errors.length) result.status = 'inconclusive';
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'paired') process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'inconclusive', campaignConclusion: 'not-assessed', errors: [error.message] }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { auditCampaign, expectedArms, readReportFiles, validateManifest, isDiagnosticPilot };
