'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function invoke(campaign, input) {
  const startedAt = new Date().toISOString();
  const args = [path.join(__dirname, input.file), ...input.args];
  const result = spawnSync(process.execPath, args, { cwd: __dirname, windowsHide: true,
    encoding: 'utf8', timeout: 1800000, maxBuffer: 8 * 1024 * 1024 });
  const record = { command: [process.execPath, ...args], startedAt, completedAt: new Date().toISOString(),
    exitCode: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
  fs.writeFileSync(path.join(campaign, input.label + '.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
  console.log(input.label, result.status, result.stdout?.trim());
  if (result.status !== 0) throw Error(`${input.label} failed`);
}

async function main(campaign, manifestHash) {
  invoke(campaign, { label: 'verification', file: 'verify.cjs', args: [campaign, manifestHash] });
  invoke(campaign, { label: 'retention-execution', file: 'retention.cjs', args: [campaign, path.join(campaign, 'cold-identity'), manifestHash] });
  invoke(campaign, { label: 'report-generation', file: 'report.cjs', args: [campaign] });
  await require('./engine.cjs').stop();
  fs.writeFileSync(path.join(campaign, 'completion.json'), JSON.stringify({
    completedAt: new Date().toISOString(), verificationExitCode: 0, report: path.join(campaign, 'report.html'),
    ownedEngineStopped: true, promotionAuthorized: false
  }, null, 2), { flag: 'wx' });
}

if (require.main === module) main(path.resolve(process.argv[2]), process.argv[3]).catch(error => {
  console.error(error); process.exitCode = 1;
});
