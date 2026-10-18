#!/usr/bin/env node
'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const qualification = require('../src/services/foundationalPrincipleQualification');

function digestOutput(result) {
  return crypto.createHash('sha256').update(result.stdout || '').update('\0')
    .update(result.stderr || '').digest('hex');
}

function observe(repositoryRoot, manifest, test) {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, test)], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD
      || 'foundational-qualification-test-only' }
  });
  assert.equal(result.status, 0, `${test} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return { exitCode: result.status, revision: manifest.qualificationRevision,
    observedAt: new Date().toISOString(), outputDigest: digestOutput(result) };
}

function assertAncestor(repositoryRoot, revision) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], {
    cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, 'The qualification revision must be an ancestor of HEAD.');
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const manifestPath = path.join(repositoryRoot, 'shared',
    'foundationalPrinciplesQualification.json');
  const manifest = qualification.readManifest(manifestPath);
  assertAncestor(repositoryRoot, manifest.baselineRevision);
  assertAncestor(repositoryRoot, manifest.qualificationRevision);
  const observations = Object.fromEntries(manifest.evidenceSuite.map((test) =>
    [test, observe(repositoryRoot, manifest, test)]));
  process.stdout.write(`${JSON.stringify(qualification.qualify({ repositoryRoot, manifest,
    observations }), null, 2)}\n`);
}

if (require.main === module) main();
