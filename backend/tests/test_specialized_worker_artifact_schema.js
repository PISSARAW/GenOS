'use strict';
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { workerArtifactResponseFormat } = require('../src/services/agents/workerArtifactResponseSchema');
const { artifactInstruction } = require('../src/services/agents/workerArtifactInstructions');
const { attachWorkerArtifact } = require('../src/services/workerEvidenceLocalArtifact');

function reply(type, content) {
  return { outcome: 'success', claims: [{ statement: 'Bounded candidate.', evidence: ['mission'] }],
    workerArtifact: { type, content, provenance: { sourceRefs: ['mission'] } } };
}
function validate(kind) { return new Ajv({ strict: false }).compile(workerArtifactResponseFormat(kind, ['mission']).schema); }
function runtime(kind, output) {
  const report = { fullText: JSON.stringify(output) };
  attachWorkerArtifact(report, { mission: { workerKind: kind }, agentName: 'schema-test' });
  return report.workerArtifact;
}

const creative = validate('creative_worker');
const content = { candidate: 'First line\n\nSecond line', assumptions: ['Synthetic task'], falsificationTest: 'Count lines.' };
assert.equal(creative(reply('creative_candidate', content)), true, JSON.stringify(creative.errors));
assert.equal(creative(reply('creative_candidate', {})), false, 'The provider must require the same fields as the runtime.');
assert.equal(creative(reply('creative_candidate', { ...content, assumptions: [] })), false);
assert.equal(runtime('creative_worker', reply('creative_candidate', content)).content.candidate, content.candidate,
  'Runtime must preserve decoded text, rather than rewriting or unescaping it.');
const literal = { ...content, candidate: String.raw`First\nSecond` };
assert.equal(runtime('creative_worker', reply('creative_candidate', literal)).content.candidate, literal.candidate);
assert.match(artifactInstruction({ evidence: { requiredArtifacts: ['creative_candidate'] } }), /decoded candidate contains real newline/);

const clinical = validate('medical_worker');
const legacy = { caseScope: 'synthetic_educational', differentialConsiderations: ['General possibilities need independent review.'],
  uncertainty: 'Fictional data are incomplete.', safetyNote: 'No individual diagnosis or treatment advice.' };
const sections = { ...legacy, missingInformation: ['Missing fictional case information.'], emergencyWarningSigns: ['General warning signs require clinical review.'] };
assert.equal(clinical(reply('clinical_report', sections)), true, JSON.stringify(clinical.errors));
assert.equal(clinical(reply('clinical_report', legacy)), false, 'New local generation must expose both sections.');
assert.equal(runtime('medical_worker', reply('clinical_report', legacy)).content.caseScope, 'synthetic_educational',
  'Historical and deterministic reports remain readable.');
assert.deepEqual(runtime('medical_worker', reply('clinical_report', sections)).content.missingInformation, sections.missingInformation);
assert.throws(() => runtime('medical_worker', reply('clinical_report', { ...sections, emergencyWarningSigns: [1] })), { code: 'INVALID_WORKER_ARTIFACT' });
assert.throws(() => runtime('medical_worker', reply('clinical_report', { ...sections, diagnosis: 'A definitive diagnosis.' })), { code: 'INVALID_WORKER_ARTIFACT' });
assert.throws(() => runtime('medical_worker', reply('clinical_report', { ...sections, emergencyWarningSigns: ['Take medication now.'] })), { code: 'INVALID_WORKER_ARTIFACT' });
console.log('Specialized provider schemas align with candidate and non-diagnostic runtime contracts: PASS');
