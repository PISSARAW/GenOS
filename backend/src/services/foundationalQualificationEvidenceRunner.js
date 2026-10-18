'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function digestOutput(result) {
  return crypto.createHash('sha256').update(result.stdout || '').update('\0')
    .update(result.stderr || '').digest('hex');
}

function evidenceEnvironment(sandbox) {
  return { ...process.env, GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(sandbox, 'genos.db'),
    GENOS_STUDIO_ROOT: path.join(sandbox, 'studio'),
    GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD
      || 'foundational-qualification-test-only' };
}

function runEvidence(repositoryRoot, manifest, test) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-foundation-'));
  try {
    const result = spawnSync(process.execPath, [path.join(repositoryRoot, test)], {
      cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: evidenceEnvironment(sandbox)
    });
    if (result.status !== 0) {
      throw new Error(`${test} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
    }
    return { exitCode: result.status, revision: manifest.qualificationRevision,
      observedAt: new Date().toISOString(), outputDigest: digestOutput(result) };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function collectEvidence(repositoryRoot, manifest) {
  return Object.fromEntries(manifest.evidenceSuite.map((test) =>
    [test, runEvidence(repositoryRoot, manifest, test)]));
}

module.exports = { collectEvidence };
