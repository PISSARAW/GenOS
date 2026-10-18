#!/usr/bin/env node
'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const qualification = require('../src/services/foundationalPrincipleQualification');
const evidenceRunner = require('../src/services/foundationalQualificationEvidenceRunner');

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
  const observations = evidenceRunner.collectEvidence(repositoryRoot, manifest);
  process.stdout.write(`${JSON.stringify(qualification.qualify({ repositoryRoot, manifest,
    observations }), null, 2)}\n`);
}

if (require.main === module) main();
