'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateSocialWorldReport } = require('../../backend/src/services/socialWorldReportValidator');
const { evaluateCampaign } = require('../../backend/src/services/socialWorldCampaignAggregate');

function campaignDirectory(args) {
  const index = args.indexOf('--revision'); const revision = index < 0 ? '1' : args[index + 1];
  if (revision === '1') return path.resolve(__dirname, 'campaigns/socialworld-v2');
  if (revision === '2') return path.resolve(__dirname, 'campaigns/socialworld-v2-r2');
  throw new Error('Supported V2-06 revisions are 1 and 2.');
}

function inputPath(args, reportsRoot) {
  const index = args.indexOf('--input');
  if (index < 0 || !args[index + 1]) throw new Error('Usage: node benchmarks/social-world/evaluate-v2-06.cjs --input <report.json>');
  const filename = fs.realpathSync(path.resolve(process.cwd(), args[index + 1]));
  const root = fs.realpathSync(reportsRoot);
  const relative = path.relative(root, filename);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !fs.statSync(filename).isFile()) throw new Error('Input report must be inside the V2-06 reports directory.');
  return filename;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function assessment(input) {
  const { report, filename, manifestFile, reportsRoot } = input;
  const validation = validateSocialWorldReport(report, { reportPath: filename, manifestFile, reportsRoot });
  return { status: validation.valid ? validation.status : 'fail',
    reasons: validation.errors || [], comparisonObservations: validation.comparisonObservations || [] };
}

function main() {
  try {
    const args = process.argv.slice(2); const directory = campaignDirectory(args);
    const manifestFile = path.join(directory, 'manifest.json'); const reportsRoot = path.join(directory, 'reports');
    if (args.includes('--campaign')) return campaignMain(manifestFile, reportsRoot);
    const filename = inputPath(args, reportsRoot);
    const report = readJson(filename);
    const manifest = readJson(manifestFile);
    const result = assessment({ report, filename, manifestFile, reportsRoot });
    process.stdout.write(`${JSON.stringify({ campaignId: manifest.campaignId, scenario: 'V2-06', caseId: report.caseId, ...result }, null, 2)}\n`);
    if (result.status !== 'pass') process.exitCode = result.status === 'inconclusive' ? 2 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

function campaignMain(manifestFile, reportsRoot) {
  const manifest = readJson(manifestFile);
  const result = evaluateCampaign({ reportsRoot, manifest,
    validateReport: (report, reportPath) => validateSocialWorldReport(report, { reportPath, manifestFile, reportsRoot }) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'pass') process.exitCode = result.status === 'inconclusive' ? 2 : 1;
}

main();
