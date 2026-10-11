'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createManifest } = require('./workerComplianceManifest.cjs');

const root = path.resolve(__dirname, '../..');
const manifest = createManifest({ root, runId: 'manifest-test', model: 'local://fixture' });
assert.equal(manifest.runId, 'manifest-test');
assert.equal(manifest.environment.model, 'local://fixture');
assert.equal(manifest.environment.node, process.version);
assert.match(manifest.benchmarkDigest, /^sha256:[a-f0-9]{64}$/);
assert.match(manifest.source.commit, /^[a-f0-9]{40}$/);
assert.equal(manifest.source.qualificationClass, manifest.source.clean ? 'candidate' : 'exploratory');

const missing = createManifest({ root: path.join(root, 'backend/tests'),
  runId: 'missing-repository', model: 'local://fixture' });
assert.equal(missing.source.commit, manifest.source.commit);
const outside = createManifest({ root: path.parse(root).root, runId: 'outside', model: 'local://fixture' });
assert.equal(outside.source.qualificationClass, 'exploratory');

console.log('Worker compliance manifest records source, environment and benchmark identity: PASS');
