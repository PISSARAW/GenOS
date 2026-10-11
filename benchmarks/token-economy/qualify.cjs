'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { compileEvidenceDelta, decodeEvidenceDelta } = require('../../backend/src/services/agentEvidence/continuationContextCompiler');
const { buildContinuationContext } = require('../../backend/bin/agent-runtime-prompt.cjs');

function estimatedTokens(value) {
  return Math.ceil(Buffer.byteLength(value, 'utf8') / 4);
}

function fixture(name) {
  if (name === 'homogeneous') {
    const claims = Array.from({ length: 80 }, (_, index) => ({
      statement: `Claim ${index}: ${'measured '.repeat(14)}`,
      evidence: [`source:${index}`, `receipt:${index}`], status: 'provisional'
    }));
    claims[79].statement += ' CRITICAL_CONTRADICTION_AT_END';
    return { claims, uncertainties: ['The last claim is contradicted.'], outcome: 'unresolved' };
  }
  if (name === 'heterogeneous') {
    return { claims: [{ statement: 'A', evidence: ['source:A'] },
      { statement: 'B', evidence: ['source:B'], contradiction: 'A' }] };
  }
  return { claims: [{ statement: 'A', evidence: ['source:A'] }] };
}

function qualify(name) {
  const report = fixture(name);
  const original = JSON.stringify(report);
  const compiled = compileEvidenceDelta(report);
  const restored = decodeEvidenceDelta(compiled);
  assert.deepEqual(restored, report);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(restored)).digest('hex'), compiled.sourceSha256);
  const prompt = buildContinuationContext(null, report, 2000);
  if (name === 'homogeneous') {
    assert.ok(original.length > 8000);
    assert.ok(!original.slice(0, 8000).includes('CRITICAL_CONTRADICTION_AT_END'));
    assert.ok(prompt.includes('CRITICAL_CONTRADICTION_AT_END'));
    assert.ok(prompt.includes('source:79'));
  }
  return { fixture: name, encoding: compiled.encoding,
    sourceChars: original.length, contextChars: compiled.data.length,
    sourceTokenEstimate: estimatedTokens(original), contextTokenEstimate: estimatedTokens(compiled.data),
    promptTokenEstimate: estimatedTokens(prompt), exactRoundTrip: true };
}

for (const name of ['homogeneous', 'heterogeneous', 'small']) {
  console.log(JSON.stringify(qualify(name)));
}
