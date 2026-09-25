'use strict';

const assert = require('node:assert/strict');
const { localArtifactInstruction } = require('../src/services/localArtifactInstruction');
const { inspectWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

const readOnlyInstruction = localArtifactInstruction(false);
assert.match(readOnlyInstruction, /File writes are forbidden/);
assert.match(readOnlyInstruction, /Do not use \[ARTIFACT\] tags/);
assert.match(localArtifactInstruction(true), /\[ARTIFACT: path\/to\/file\]/);

const content = { claims: [{ statement: 'Verified worker claim', evidence: ['receipt:r1'] }] };
const tagged = `[ARTIFACT: dossiers/worker.json]${JSON.stringify({ claims: content.claims })}[/ARTIFACT]`;
const result = inspectWorkerArtifact('specialist', tagged, { source: 'test' });
assert.equal(result.issues.length, 0);
assert.equal(result.artifact.type, 'dossier');
console.log('Read-only artifact handling checks passed.');
