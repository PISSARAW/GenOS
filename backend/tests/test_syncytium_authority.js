'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Shared API refactor.', {
    schema: { fields: [
      { path: 'api.contract', dataType: 'LWW_REGISTER', ownerDomain: 'backend' },
      { path: 'api.security', dataType: 'LWW_REGISTER', ownerDomain: 'backend', authorityPolicy: 'EXPLICIT' }
    ] },
    nuclearDomains: [
      { domainId: 'backend', members: ['backend-agent'], owns: ['api.*'] },
      { domainId: 'security', members: ['security-agent'], mayWrite: ['api.security'], mayRead: ['api.*'], mayVeto: ['api.security'] }
    ]
  });

  const ownerWrite = await syncytium.applyOperation(session.sessionId, {
    opId: 'owner-write', actorId: 'backend-agent', domainId: 'backend',
    kind: { type: 'set_field', key: 'api.contract', value: 'v2' }
  });
  assert.equal(ownerWrite.snapshot.sharedFields['api.contract'], 'v2');

  const delegatedWrite = await syncytium.applyOperation(session.sessionId, {
    opId: 'delegated-write', actorId: 'security-agent', domainId: 'security',
    kind: { type: 'set_field', key: 'api.security', value: 'verified' }
  });
  assert.equal(delegatedWrite.snapshot.sharedFields['api.security'], 'verified');

  await assert.rejects(() => syncytium.applyOperation(session.sessionId, {
    opId: 'unauthorized-write', actorId: 'security-agent',
    kind: { type: 'set_field', key: 'api.contract', value: 'unauthorized' }
  }), (error) => error.code === 'SYNCYTIUM_AUTHORITY_VIOLATION');
  const snapshot = await syncytium.snapshot(session.sessionId);
  assert.equal(snapshot.shared.logSize, 2);
  assert.equal(snapshot.shared.sharedFields['api.contract'], 'v2');
  assert.equal(snapshot.domains.backend.owns[0], 'api.*');

  assert.throws(() => require('../src/services/syncytium/domains/nuclearDomainService').compile([
    { domainId: 'duplicate' }, { domainId: 'duplicate' }
  ]), (error) => error.code === 'SYNCYTIUM_DOMAIN_INVALID');
}

main().then(() => console.log('Syncytium authority checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
