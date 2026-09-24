'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Selective domain views.', {
    schema: { fields: [
      { path: 'docs.public', dataType: 'LWW_REGISTER', ownerDomain: 'docs' },
      { path: 'docs.private', dataType: 'LWW_REGISTER', ownerDomain: 'docs', visibility: 'PRIVATE' },
      { path: 'shared.readme', dataType: 'LWW_REGISTER', ownerDomain: 'shared' }
    ] },
    nuclearDomains: [
      { domainId: 'docs', members: ['writer'], owns: ['docs.*'], subscriptions: ['shared.readme', 'textContent', 'presence.*'] },
      { domainId: 'shared', members: ['owner'], owns: ['shared.*'], mayRead: ['docs.public'] },
      { domainId: 'audit', members: ['auditor'], mayRead: ['docs.public'] }
    ]
  });

  const publicWrite = await syncytium.applyOperation(session.sessionId, {
    opId: 'docs-public', actorId: 'writer', domainId: 'docs', kind: { type: 'set_field', key: 'docs.public', value: 'visible' }
  });
  assert.deepEqual(publicWrite.deltaRecipients, ['audit', 'docs', 'shared']);
  const auditResult = await syncytium.applyOperation(session.sessionId, {
    opId: 'docs-public', actorId: 'writer', domainId: 'docs', kind: { type: 'set_field', key: 'docs.public', value: 'visible' }
  }, { domainId: 'audit' });
  assert.deepEqual(Object.keys(auditResult.snapshot.sharedFields), ['docs.public']);
  assert.deepEqual(Object.keys(auditResult.schema.fields), ['docs.public']);
  await syncytium.applyOperation(session.sessionId, {
    opId: 'docs-private', actorId: 'writer', domainId: 'docs', kind: { type: 'set_field', key: 'docs.private', value: 'secret' }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'shared-readme', actorId: 'owner', domainId: 'shared', kind: { type: 'set_field', key: 'shared.readme', value: 'common' }
  });
  const text = await syncytium.applyOperation(session.sessionId, {
    opId: 'text-delta', actorId: 'writer', kind: { type: 'insert_text', index: 0, text: 'hello' }
  });
  assert.deepEqual(text.deltaRecipients, ['docs']);

  const docsView = await syncytium.snapshot(session.sessionId, { domainId: 'docs' });
  assert.equal(docsView.shared.sharedFields['docs.public'], 'visible');
  assert.equal(docsView.shared.sharedFields['docs.private'], 'secret');
  assert.equal(docsView.shared.sharedFields['shared.readme'], 'common');
  assert.equal(docsView.shared.textContent, 'hello');
  assert.equal(docsView.schema.fields['docs.private'].visibility, 'PRIVATE');

  const auditView = await syncytium.snapshot(session.sessionId, { domainId: 'audit' });
  assert.deepEqual(auditView.shared.sharedFields, { 'docs.public': 'visible' });
  assert.equal(auditView.shared.textContent, '');
  assert.deepEqual(Object.keys(auditView.schema.fields), ['docs.public']);
  await assert.rejects(() => syncytium.snapshot(session.sessionId, { domainId: 'missing' }),
    (error) => error.code === 'SYNCYTIUM_DOMAIN_UNKNOWN');
}

main().then(() => console.log('Syncytium selective projection checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
