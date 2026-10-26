'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applySearchReplace, extractSearchReplaceBlocks } = require('../src/evaluation/swe_surgical_patcher');
const { appendAttemptArtifact, sha256 } = require('../src/evaluation/swe_attempt_artifacts');
const { selectVenvName } = require('../src/evaluation/swe_native_verifier');

const source = 'def f():\n    return "123: value"\n';
const patch = JSON.stringify({ SEARCH: '2 |     return "123: value"', REPLACE: '    return "updated"' });
const applied = applySearchReplace(source, patch);
assert.equal(applied.replacementsCount, 1);
assert.match(applied.modified, /return "updated"/);
assert.equal(extractSearchReplaceBlocks(JSON.stringify({ SEARCH: '123: value', REPLACE: 'new value' }))[0].searchStr, '123: value');
assert.equal(selectVenvName({ repo: 'pallets/flask', version: '2.3.0' }, 'pallets__flask'), 'pallets__flask_py312');

const originalDir = process.env.GENOS_SWE_ARTIFACT_DIR;
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-swe-attempt-'));
try {
  process.env.GENOS_SWE_ARTIFACT_DIR = artifactDir;
  assert.equal(appendAttemptArtifact({ instanceId: '../unsafe', attempt: 1, excerptSha256: sha256('excerpt') }), true);
  const artifactName = fs.readdirSync(artifactDir)[0];
  assert.equal(artifactName, '.._unsafe.attempts.jsonl');
  const record = JSON.parse(fs.readFileSync(path.join(artifactDir, artifactName), 'utf8'));
  assert.equal(record.schema, 'genos.swe.attempt/v1');
  assert.equal(record.excerptSha256, sha256('excerpt'));
} finally {
  if (originalDir === undefined) delete process.env.GENOS_SWE_ARTIFACT_DIR;
  else process.env.GENOS_SWE_ARTIFACT_DIR = originalDir;
  fs.rmSync(artifactDir, { recursive: true, force: true });
}

console.log('SWE attempt artifacts, line-number parsing, and task venv selection: PASS');
