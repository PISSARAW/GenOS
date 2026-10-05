'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nce-cli-'));
  try {
    const configPath = path.join(root, 'config.json');
    const reportPath = path.join(root, 'report.json');
    await fs.writeFile(configPath, JSON.stringify({ root,
      databasePath: path.join(root, 'state.db'), agentId: 'cli-agent', runId: 'cli-1',
      family: 'ascending', seed: 7, count: 1, features: { play: false } }));
    await promisify(execFile)(process.execPath,
      [path.resolve(__dirname, '../bin/genos-nce-experiment.cjs'), 'cycle', configPath, reportPath],
      { timeout: 90000, windowsHide: true, env: { ...process.env,
        GENOS_ADMIN_PASSWORD: require('node:crypto').randomBytes(24).toString('hex') } });
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.measured, true);
    assert.equal(report.promoted, false, 'CLI success does not imply a positive learning result');
    assert.equal(report.delta, 0);
    assert.ok(report.transitionEvidenceRef);
    console.log('NCE CLI with real migrated SQLite and honest negative report: PASS');
  } finally { await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
