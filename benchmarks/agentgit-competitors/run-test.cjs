'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { runManifest, validateManifest } = require('./run.cjs');

async function main() {
  const manifest = { schema: 'genos.agentgit-benchmark-manifest/v1',
    tasks: [{ id: 'integrity-tamper', input: { tamper: true } }],
    systems: [{ name: 'Fixture', version: 'fixture-1', adapter: process.execPath,
      args: [path.join(__dirname, 'mock-adapter.cjs')] }] };
  validateManifest(manifest);
  const { runs, report } = await runManifest(manifest, __dirname);
  assert.equal(runs[0].tasks[0].id, 'integrity-tamper');
  assert.equal(runs[0].tasks[0].receiptHash.length, 64);
  assert.equal(report.systems[0].metrics.integrity.pass, 1);
  assert.throws(() => validateManifest({ ...manifest, tasks: [manifest.tasks[0], manifest.tasks[0]] }), /unique/);
  console.log('AgentGit benchmark adapter runner passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
