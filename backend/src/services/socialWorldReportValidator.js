'use strict';

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { evaluateSocialMetacognition } = require('./socialMetacognitionCampaignService');
const { stableHash, verifyV2Evidence } = require('./socialWorldReportEvidence');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'spec/socialworld-campaign-report.schema.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'benchmarks/social-world/campaigns/socialworld-v2/manifest.json');
const DEFAULT_REPORT_ROOT = path.join(path.dirname(MANIFEST_PATH), 'reports');
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function invalid(errors) {
  return { valid: false, errors, status: 'fail' };
}

function validateSocialWorldReport(report, options = {}) {
  if (!validate(report)) return invalid(ajv.errorsText(validate.errors).split('; '));
  const errors = commonErrors(report);
  if (report.scenario !== 'V2-06') return { valid: errors.length === 0, errors };
  return validateV2Report(report, options, errors);
}

function commonErrors(report) {
  const errors = [];
  if (report.status === 'pass' && report.evidenceRefs.length === 0) errors.push('A passing report requires evidence references.');
  if (report.status === 'pass' && report.violations.length > 0) errors.push('A passing report cannot contain violations.');
  return errors;
}

function readJson(filename) {
  const bytes = fs.readFileSync(filename);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function makeContext(options) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const manifestFile = options.manifestFile || path.join(repoRoot, 'benchmarks/social-world/campaigns/socialworld-v2/manifest.json');
  const manifest = readJson(manifestFile).value;
  const scenario = manifest.scenarios.find((entry) => entry.id === 'V2-06');
  if (!scenario) throw new Error('V2-06 is absent from the campaign manifest.');
  const caseFile = options.caseFile || path.join(path.dirname(manifestFile), scenario.caseFile);
  const caseData = readJson(caseFile);
  return {
    repoRoot, manifest, scenario, caseData, caseFile,
    reportsRoot: options.reportsRoot || path.join(path.dirname(manifestFile), 'reports'),
    reportPath: options.reportPath || '',
  };
}

function validateV2Report(report, options, errors) {
  let context;
  try { context = makeContext(options); }
  catch (error) { return invalid([...errors, `Cannot load V2-06 contract: ${error.message}`]); }
  errors.push(...metadataErrors(report, context));
  const evidence = verifyV2Evidence(report, { reportsRoot: context.reportsRoot, caseData: context.caseData.value,
    pathPrefix: report.pilot === true ? `pilot/${report.seed}/` : undefined });
  errors.push(...evidence.errors);
  if (errors.length) return invalid(errors);
  const status = recalculate(report, evidence, context.caseData.value);
  if (report.status !== status || report.oracle.status !== status) {
    errors.push('Report status does not match the independently recalculated result.');
  }
  return { valid: errors.length === 0, errors, status, comparisonObservations: evidence.comparisonObservations };
}

function metadataErrors(report, context) {
  return [...manifestErrors(report, context), ...caseErrors(report, context), ...reportErrors(report, context)];
}

function manifestErrors(report, context) {
  const errors = [];
  if (report.campaignId !== context.manifest.campaignId) errors.push('campaignId is not registered in the manifest.');
  if (report.arm !== 'genos-full') errors.push('A composite per-seed report must declare top-level arm genos-full.');
  errors.push(...seedErrors(report, context));
  if (!sameSet(Object.keys(report.arms), context.manifest.comparisonArms?.['V2-06'] || [])) {
    errors.push('Report arms must exactly match manifest comparisonArms[V2-06].');
  }
  if (!sameSet(context.manifest.comparisonArms?.['V2-06'] || [], context.manifest.arms)) {
    errors.push('V2-06 comparison arms differ from the campaign arm catalog.');
  }
  return errors;
}

function seedErrors(report, context) {
  if (report.pilot !== true) return context.manifest.seeds.includes(report.seed) ? [] : ['Seed is not registered in the campaign manifest.'];
  const errors = [];
  if (!/^pilot-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(report.seed)) {
    errors.push('Pilot seed must use the isolated pilot identity.');
  }
  if (!context.reportPath || !pilotReportPath(context.reportPath, context.reportsRoot, report.seed)) errors.push('Pilot report must be stored under reports/pilot/<seed>.');
  return errors;
}

function caseErrors(report, context) {
  const errors = [];
  if (report.caseId !== context.caseData.value.caseId) errors.push('caseId differs from the registered case file.');
  if (report.caseHash !== crypto.createHash('sha256').update(context.caseData.bytes).digest('hex')) {
    errors.push('caseHash differs from the registered case file.');
  }
  if (report.configHash !== stableHash(report.config)) errors.push('configHash does not match the canonical config payload.');
  if (report.oracle.caseId !== report.caseId) errors.push('oracle.caseId differs from report.caseId.');
  return errors;
}

function reportErrors(report, context) {
  const errors = [];
  if (!commitExists(report.sourceCommit, context.repoRoot)) errors.push('sourceCommit is not an available Git commit.');
  if (context.reportPath && !(report.pilot === true ? pilotReportPath(context.reportPath, context.reportsRoot, report.seed)
    : isConfinedFile(context.reportPath, context.reportsRoot))) errors.push('Report path is outside its campaign/pilot directory.');
  if (report.status !== 'pass' && (!report.reasonCode || report.limitations.length === 0)) {
    errors.push('Failed or inconclusive reports require a reasonCode and explicit limitations.');
  }
  return errors;
}

function sameSet(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function commitExists(commit, repoRoot) {
  try { execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: repoRoot, stdio: 'ignore' }); return true; }
  catch { return false; }
}

function isConfinedFile(filename, root) {
  try {
    const base = fs.realpathSync(root);
    const actual = fs.realpathSync(filename);
    const relative = path.relative(base, actual);
    return Boolean(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  } catch { return false; }
}

function pilotReportPath(filename, reportsRoot, seed) {
  return isConfinedFile(filename, path.join(reportsRoot, 'pilot', seed));
}

function mappedOracleArms(report, evidence) {
  const roles = { baseline: 'genos-full', masked: 'genos-social-memory-ablated', counterfactual: 'genos-social-memory-counterfactual' };
  const arms = {};
  for (const [role, armName] of Object.entries(roles)) {
    const entry = report.arms[armName];
    const modelArtifact = evidence.artifactsByArm[armName].find((item) => item.kind === 'social-model-snapshot');
    arms[role] = {
      model: modelArtifact?.model,
      decision: { ...entry.decision, receiptId: entry.decision.receipt.receiptId },
      interventionReceipt: entry.interventionReceipt || { mode: 'baseline' },
    };
  }
  return arms;
}

function recalculate(report, evidence, caseFile) {
  const statuses = Object.values(report.arms).map((arm) => arm.status);
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('inconclusive')) return 'inconclusive';
  const result = evaluateSocialMetacognition({
    arms: mappedOracleArms(report, evidence), expectedActions: caseFile.expectedActions,
  });
  return result.status;
}

module.exports = { validateSocialWorldReport };
