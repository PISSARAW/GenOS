'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, '.genos-agent-worlds');
fs.mkdirSync(base, { recursive: true });
const folder = fs.mkdtempSync(path.join(base, 'test-agow-evidence-'));
const verifier = require('../../benchmarks/agow/verify-completion-campaign.cjs');
const data = require('../../benchmarks/agow/completion-corpus.cjs');

try {
  const result = spawnSync(process.execPath, [path.join(root, 'benchmarks/agow/run-completion-campaign.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true,
    env: { ...process.env, GENOS_AGOW_COMPLETION_OUTPUT: folder } });
  assert.equal(result.status, 0, result.stderr);
  const verified = verifier.verify(folder);
  assert.equal(verified.status, 'verified_local_archive');
  assert.equal(verified.summaries.length, 5);
  assert.equal(verified.promotionAllowed, false);
  const reportPath = path.join(folder, 'report.json');
  const original = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const forged = structuredClone(original);
  const receipt = forged.receipts[0];
  receipt.summary[receipt.conditions[0]].successes = 0;
  forged.artifactHash = data.hash(forged.receipts);
  fs.writeFileSync(reportPath, JSON.stringify(forged));
  assert.throws(() => verifier.verify(folder), /Summary mismatch/);
  fs.writeFileSync(reportPath, JSON.stringify(original));
  const manifestPath = path.join(folder, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.protocol.count += 1;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifier.verify(folder), /Protocol mismatch/);
  console.log('AGOW evidence archive: actual rerun, source hashes, paired summaries and forged archive rejection PASS.');
} finally {
  assert.equal(path.dirname(path.resolve(folder)), path.resolve(base));
  assert.ok(path.basename(folder).startsWith('test-agow-evidence-'));
  fs.rmSync(folder, { recursive: true, force: true });
}
