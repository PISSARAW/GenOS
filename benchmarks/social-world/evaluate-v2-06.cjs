'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { evaluateSocialMetacognition } = require('../../backend/src/services/socialMetacognitionCampaignService');
const { validateSocialWorldReport } = require('../../backend/src/services/socialWorldReportValidator');

const REPORT_DIRECTORY = path.resolve(__dirname, 'campaigns/socialworld-v2/reports');
const CASE_FILE = path.resolve(__dirname, 'campaigns/socialworld-v2/V2-06-case.json');

function inputPath(args) {
  const index = args.indexOf('--input');
  if (index < 0 || !args[index + 1]) throw new Error('Usage: node benchmarks/social-world/evaluate-v2-06.cjs --input <report.json>');
  const filename = path.resolve(process.cwd(), args[index + 1]);
  if (!filename.startsWith(`${REPORT_DIRECTORY}${path.sep}`)) throw new Error('Input report must be inside the V2-06 reports directory.');
  return filename;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function assessment(report, scenario) {
  const validation = validateSocialWorldReport(report);
  if (!validation.valid) return { status: 'fail', reasons: validation.errors };
  if (report.caseId !== scenario.caseId) return { status: 'fail', reasons: ['Unknown or unregistered case id.'] };
  const result = evaluateSocialMetacognition({ ...report, expectedActions: scenario.expectedActions });
  if (report.status !== result.status || report.oracle.status !== result.status) {
    return { ...result, status: 'fail', reasons: [...result.reasons, 'Report status does not match the recalculated oracle.'] };
  }
  return result;
}

function main() {
  try {
    const report = readJson(inputPath(process.argv.slice(2)));
    const scenario = readJson(CASE_FILE);
    const result = assessment(report, scenario);
    process.stdout.write(`${JSON.stringify({ campaignId: 'socialworld-v2', scenario: 'V2-06', caseId: scenario.caseId, ...result }, null, 2)}\n`);
    if (result.status !== 'pass') process.exitCode = result.status === 'inconclusive' ? 2 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

main();
