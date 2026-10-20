'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runCampaign } = require('./campaign.cjs');

function argument(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function main(args) {
  const output = argument(args, '--output');
  if (!output) throw Object.assign(new Error('--output is required.'), {
    code: 'HOLOBIONT_CAUSAL_OUTPUT_REQUIRED'
  });
  const report = runCampaign({
    casesPath: argument(args, '--cases'),
    repetitions: Number(argument(args, '--repetitions', 3)),
    timeoutMs: Number(argument(args, '--timeout-ms', 10000))
  });
  const destination = path.resolve(output);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: report.status, output: destination,
    cases: report.cases.length, totalArmRuns: report.bounds.totalArmRuns })}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

try { main(process.argv.slice(2)); } catch (error) {
  process.stderr.write(`${error.code || 'HOLOBIONT_CAUSAL_CAMPAIGN_FAILED'}: ${error.message}\n`);
  process.exitCode = 1;
}
