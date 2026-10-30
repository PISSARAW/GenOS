'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { workerArtifactResponseFormat } = require('../src/services/agents/workerArtifactResponseSchema');
const { artifactInstruction } = require('../src/services/agents/workerArtifactInstructions');
const { runHandoff } = require('../src/services/agents/workerCoordinationExecutor');

const validate = new Ajv({ strict: false }).compile(
  workerArtifactResponseFormat('liaison_worker', ['sha256:source']).schema);
const handoff = { sourceGroup: 'producers', targetGroup: 'reviewers',
  deliveredRefs: ['sha256:source'], delivery: 'parent_dossier', recipientAcknowledged: false };
const response = { outcome: 'success', claims: [{ statement: 'Prepared a sourced brief.',
  evidence: ['sha256:source'] }], handoff };
assert.equal(validate(response), true, JSON.stringify(validate.errors));
assert.equal(validate({ ...response, handoff: { ...handoff, recipientAcknowledged: true } }), false);
assert.equal(validate({ ...response, handoff: { ...handoff, delivery: 'recipient_inbox' } }), false);
assert.equal(validate({ ...response, handoff: { ...handoff, deliveredRefs: ['invented'] } }), false);
assert.equal(validate({ ...response, handoff: { ...handoff, recipientAcknowledged: undefined } }), false);
assert.equal(validate({ outcome: 'unresolved', claims: [], uncertainties: ['Producer artifact missing.'] }), true);
const contract = { identity: { workerKind: 'liaison_worker' }, evidence: { requiredArtifacts: ['dossier'] } };
const instruction = artifactInstruction(contract);
assert.match(instruction, /does not prove transport delivery or recipient acknowledgement/);
assert.match(instruction, /"recipientAcknowledged":false/);
const native = runHandoff({ version: 1, methodId: 'prepare_handoff', parameters: {
  sourceGroup: 'producers', targetGroup: 'reviewers',
  items: [{ sourceRef: 'sha256:source', summary: 'Source artifact.' }]
} });
assert.equal(native.output.handoff.delivery, handoff.delivery);
assert.equal(native.output.handoff.recipientAcknowledged, false);
console.log('Local handoff delivery semantics: PASS');
