'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createNestedSession('Nested specialist topologies share one guarded state.', {
    parentDomains: [
      { domainId: 'backend' }, { domainId: 'security' }, { domainId: 'architecture' }
    ],
    nestedTopologies: [
      {
        parentDomainId: 'backend', topologyId: 'backend-team', mode: 'a_team', mayRead: ['*'],
        mayWrite: ['backend.status', 'shared.release'],
        subdomains: [
          { domainId: 'workers', members: ['builder'] },
          { domainId: 'lead', members: ['lead'] }
        ]
      },
      {
        parentDomainId: 'security', topologyId: 'security-review', mode: 'trinity', mayRead: ['security.finding', 'shared.release'],
        mayWrite: ['security.finding', 'shared.release'],
        subdomains: [{ domainId: 'verifier', members: ['guard'] }]
      },
      {
        parentDomainId: 'architecture', topologyId: 'architecture-council', mode: 'biocenose', mayRead: ['*'],
        mayWrite: ['shared.release'],
        subdomains: [
          { domainId: 'proposer', members: ['architect-1'] },
          { domainId: 'critic', members: ['architect-2'] }
        ]
      }
    ],
    sharedFields: {
      'backend.status': { dataType: 'LEGACY_LWW' },
      'security.finding': { dataType: 'LEGACY_LWW' },
      'shared.release': { dataType: 'LEGACY_LWW' }
    }
  });

  const builder = session.nestedTopologies.find((item) => item.mode === 'a_team');
  assert.deepEqual(builder.requiredCapabilities.includes('SIGNALING_BUS'), true);
  const builderDomain = builder.domainIds[0];
  await syncytium.applyNestedTransaction(session.sessionId, {
    domainId: builderDomain,
    transaction: { txId: 'nested-backend-update', operations: [
      { opId: 'nested-backend-status', actorId: 'builder', kind: { type: 'set_field', key: 'backend.status', value: 'implemented' } },
      { opId: 'nested-release-contract', actorId: 'builder', kind: { type: 'set_field', key: 'shared.release', value: 'candidate-4' } }
    ] }
  });

  const verifier = await syncytium.nestedSnapshot(session.sessionId, { domainId: 'security::security-review::verifier' });
  assert.equal(verifier.shared.sharedFields['backend.status'], undefined);
  assert.equal(verifier.shared.sharedFields['shared.release'], 'candidate-4');
  await syncytium.applyNestedOperation(session.sessionId, {
    domainId: 'security::security-review::verifier',
    operation: { opId: 'security-finding', actorId: 'guard', kind: { type: 'set_field', key: 'security.finding', value: 'clear' } }
  });
  await assert.rejects(() => syncytium.applyNestedOperation(session.sessionId, {
    domainId: 'security::security-review::verifier',
    operation: { opId: 'unauthorized-backend-write', actorId: 'guard', kind: { type: 'set_field', key: 'backend.status', value: 'tampered' } }
  }), (error) => error.code === 'SYNCYTIUM_AUTHORITY_VIOLATION');
  await assert.rejects(() => syncytium.applyNestedOperation(session.sessionId, {
    domainId: 'backend', operation: { opId: 'root-write', actorId: 'builder', kind: { type: 'set_field', key: 'backend.status', value: 'bad' } }
  }), (error) => error.code === 'SYNCYTIUM_NESTED_TOPOLOGY_INVALID');
}

main().then(() => console.log('Syncytium nested topology checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
