'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateSocialWorldReport } = require('../../backend/src/services/socialWorldReportValidator');
const { evaluateCampaign } = require('../../backend/src/services/socialWorldCampaignAggregate');

const REPORT_DIRECTORY = path.resolve(__dirname, 'campaigns/socialworld-v2/reports');

function inputPath(args) {
  const index = args.indexOf('--input');
  if (index < 0 || !args[index + 1]) throw new Error('Usage: node benchmarks/social-world/evaluate-v2-06.cjs --input <report.json>');
  const filename = fs.realpathSync(path.resolve(process.cwd(), args[index + 1]));
  const root = fs.realpathSync(REPORT_DIRECTORY);
  const relative = path.relative(root, filename);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !fs.statSync(filename).isFile()) throw new Error('Input report must be inside the V2-06 reports directory.');
  return filename;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function assessment(report, filename) {
  const validation = validateSocialWorldReport(report, { reportPath: filename });
  return { status: validation.valid ? validation.status : 'fail',
    reasons: validation.errors || [], comparisonObservations: validation.comparisonObservations || [] };
}

function main() {
  try {
    if (process.argv.includes('--campaign')) return campaignMain();
    const filename = inputPath(process.argv.slice(2));
    const report = readJson(filename);
    const result = assessment(report, filename);
    process.stdout.write(`${JSON.stringify({ campaignId: 'socialworld-v2', scenario: 'V2-06', caseId: report.caseId, ...result }, null, 2)}\n`);
    if (result.status !== 'pass') process.exitCode = result.status === 'inconclusive' ? 2 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

function campaignMain() {
  const manifestFile = path.resolve(__dirname, 'campaigns/socialworld-v2/manifest.json');
  const manifest = readJson(manifestFile);
  const reportsRoot = path.resolve(__dirname, 'campaigns/socialworld-v2/reports');
  const result = evaluateCampaign({ reportsRoot, manifest,
    validateReport: (report, reportPath) => validateSocialWorldReport(report, { reportPath }) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'pass') process.exitCode = result.status === 'inconclusive' ? 2 : 1;
}

main();
