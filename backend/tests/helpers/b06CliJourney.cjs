'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);

async function run(spec, output) {
  const args = ['inspect-run', '--run-id', spec.run.id, '--organization-id', spec.settings.organization,
    '--project-id', spec.settings.project];
  const env = { ...process.env, GENOS_API_URL: spec.settings.url, GENOS_API_TOKEN: spec.token };
  delete env.GENOS_API_KEY;
  const shim = await execute('powershell.exe', ['-NoProfile', '-File', path.resolve(__dirname, '../../../g.ps1'), ...args],
    { env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, 'cli.log'), shim.stdout + '\n' + shim.stderr);
  const view = JSON.parse(shim.stdout);
  assert.equal(view.run.id, spec.run.id);
  assert.equal(view.promotion.phase, 'completed');
  assert.equal(view.provenance[0].memories.length, 1);
  const targetRoot = process.env.CARGO_TARGET_DIR || path.resolve(__dirname, '../../../target');
  const binary = path.join(targetRoot, 'debug', 'g.exe');
  await assert.rejects(execute(binary, args, { env: { ...env, GENOS_API_TOKEN: '' }, windowsHide: true }), error => error.code === 1);
  const foreign = args.slice(); foreign[foreign.length - 1] = 'b06-other';
  await assert.rejects(execute(binary, foreign, { env, windowsHide: true }), error => error.code === 1);
  return { runId: view.run.id, provenance: view.provenance, snapshots: view.snapshots,
    anonymousExitCode: 1, foreignProjectExitCode: 1, shim: 'g.ps1' };
}

module.exports = { run };
