'use strict';

const assert = require('node:assert/strict');
const values = require('../src/services/missionProtocols/evidenceValues');
const { createMessage } = require('../src/services/evidenceProtocol/contract');
const fixture = require('./helpers/evidenceProtocolContractFixture');
const now = Date.now();
const parent = { expiresAt: new Date(now + 60000).toISOString() };
const proof = { attestation: { value: { completedAt: new Date(now - 20000).toISOString(),
  validUntil: new Date(now - 1000).toISOString() } } };
const base = fixture.message();

assert.throws(() => createMessage({ ...base, ...values.messageTimes(parent, { proof }) }),
  { code: 'EVIDENCE_EXPIRED' });
const delegated = values.messageTimes(parent, { proof, delegated: true });
assert.equal(delegated.expiresAt, parent.expiresAt);
assert.ok(Date.parse(delegated.createdAt) >= now);
assert.doesNotThrow(() => createMessage({ ...base, ...delegated }));
const expiredParent = { expiresAt: new Date(now - 1).toISOString() };
assert.throws(() => createMessage({ ...base, ...values.messageTimes(expiredParent, { proof, delegated: true }) }),
  { code: 'EVIDENCE_EXPIRY_INVALID' });
console.log('Delegated synthesis uses current parent message authority; expired ordinary proof and expired parent still refused: PASS.');
