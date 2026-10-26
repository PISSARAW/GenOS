'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applySearchReplace, extractSearchReplaceBlocks } = require('../src/evaluation/swe_surgical_patcher');
const { appendAttemptArtifact, sha256 } = require('../src/evaluation/swe_attempt_artifacts');
const { selectVenvName } = require('../src/evaluation/swe_native_verifier');
const { buildAdversarialCritique } = require('../src/evaluation/swe_biomimetic_engine');

const source = 'def f():\n    return "123: value"\n';
const patch = JSON.stringify({ SEARCH: '2 |     return "123: value"', REPLACE: '    return "updated"' });
const applied = applySearchReplace(source, patch);
assert.equal(applied.replacementsCount, 1);
assert.match(applied.modified, /return "updated"/);
const escapedLines = JSON.stringify({
  SEARCH: '1 | def f():\\n2 | \\ \\ \\ \\ return "123: value"',
  REPLACE: '1 | def f():\\n2 | \\ \\ \\ \\ return "decoded"'
});
assert.equal(applySearchReplace(source, escapedLines).replacementsCount, 1);
assert.equal(extractSearchReplaceBlocks(JSON.stringify({ SEARCH: '123: value', REPLACE: 'new value' }))[0].searchStr, '123: value');
assert.equal(selectVenvName({ repo: 'pallets/flask', version: '2.3.0' }, 'pallets__flask'), 'pallets__flask_py312');
const verifierFeedback = 'test_route_decorator_custom_endpoint_with_dots failed: ValueError was not raised';
assert.ok(buildAdversarialCritique({ attempt: 2, lastFeedback: verifierFeedback }).includes(verifierFeedback));
const longFeedback = `${'x'.repeat(2600)}specific failing assertion`;
assert.ok(buildAdversarialCritique({ attempt: 2, lastFeedback: longFeedback }).includes('specific failing assertion'));

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
