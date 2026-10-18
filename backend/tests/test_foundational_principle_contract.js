'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const qualification = require('../src/services/foundationalPrincipleQualification');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const manifestPath = path.join(repositoryRoot, 'shared',
    'foundationalPrinciplesQualification.json');
  const manifest = qualification.readManifest(manifestPath);
  const validated = qualification.validateManifest(manifest, repositoryRoot);
  assert.equal(manifest.principles.length, 19);
  assert.ok(validated.references.length > manifest.principles.length);

  const conflated = clone(manifest);
  conflated.principles[18].concept = conflated.principles[18].capability;
  assert.throws(() => qualification.validateManifest(conflated, repositoryRoot),
    { code: 'FOUNDATION_CONCEPT_CAPABILITY_CONFLATED' });

  const unbounded = clone(manifest);
  unbounded.principles[0].limitations = [];
  assert.throws(() => qualification.validateManifest(unbounded, repositoryRoot),
    { code: 'FOUNDATION_LIMIT_REQUIRED' });

  const unsupported = clone(manifest);
  unsupported.principles[0].score = 4;
  unsupported.principles[0].evidenceTests = ['backend/tests/not-a-proof.js'];
  assert.throws(() => qualification.validateManifest(unsupported, repositoryRoot),
    { code: 'FOUNDATION_EVIDENCE_OUTSIDE_SUITE' });
  console.log('Foundational principle contract: 19 bounded capabilities remain distinct from metaphors.');
}

if (require.main === module) main();
module.exports = { main };
