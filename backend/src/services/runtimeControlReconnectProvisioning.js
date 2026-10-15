'use strict';
const protocol = require('./runtimeControlReconnectProtocol');
const signingAuthority = require('./runtimeControlSigningAuthority');

const DESCRIPTOR_TYPE = 'genos-runtime-control-reconnect-descriptor';
const ACK_TYPE = 'genos-runtime-control-reconnect-descriptor-ack';
const LINEAGE_KEYS = ['episodeId', 'missionId', 'organizationId', 'projectId',
  'threadId', 'workerId'];

function encodedLineage(identity) {
  const keys = Object.keys(identity || {}).sort();
  if (keys.join('\0') !== LINEAGE_KEYS.join('\0')
    || !protocol.exactLineage(identity, identity)) {
    throw new Error('Runtime reconnect control identity is incomplete.');
  }
  return Buffer.from(JSON.stringify(identity)).toString('base64url');
}

function environment(authority, identity) {
  if (!authority) return {};
  return {
    GENOS_RUNTIME_CONTROL_BACKEND_PUBLIC_B64:
      Buffer.from(authority.publicKey).toString('base64url'),
    GENOS_RUNTIME_CONTROL_BACKEND_KEY_ID: authority.keyId,
    GENOS_RUNTIME_CONTROL_LINEAGE_B64: encodedLineage(identity)
  };
}

function acknowledgement(message, outcome) {
  return {
    type: ACK_TYPE, requestId: message.requestId,
    proven: outcome.proven, code: outcome.code,
    authorityId: outcome.authorityId || null, revision: outcome.revision || null
  };
}

async function persist(context, message) {
  const exact = protocol.exactLineage(message?.descriptor?.lineage, context.identity);
  const requestId = message?.requestId;
  if (message?.type !== DESCRIPTOR_TYPE || !/^[0-9a-f-]{36}$/i.test(requestId || '') || !exact
    || message.descriptor.backendKeyId !== context.authority.keyId) {
    return { proven: false, code: 'RECONNECT_DESCRIPTOR_REFUSED' };
  }
  try {
    const store = require('./runtimeControlAuthorityStore').create(context.db);
    const saved = await store.saveReconnectAuthority({ descriptor: message.descriptor });
    context.saved = saved;
    return { proven: true, code: 'RECONNECT_DESCRIPTOR_DURABLE',
      authorityId: saved.id, revision: saved.revision };
  } catch (_) {
    return { proven: false, code: 'RECONNECT_DESCRIPTOR_PERSISTENCE_FAILED' };
  }
}

function attach(context) {
  const onMessage = message => {
    if (message?.type !== DESCRIPTOR_TYPE) return;
    context.persistence = persist(context, message).then(outcome => {
      if (context.child.connected) context.child.send(acknowledgement(message, outcome));
    });
    context.persistence.catch(() => {});
  };
  const onClose = () => {
    context.revocation = Promise.resolve(context.persistence).then(() => {
      if (!context.saved) return null;
      const store = require('./runtimeControlAuthorityStore').create(context.db);
      return store.revokeReconnectAuthority({ id: context.saved.id,
        expectedRevision: context.saved.revision, lineage: context.identity,
        reason: 'runtime_exit' });
    });
    context.revocation.catch(() => {});
  };
  context.child.on('message', onMessage);
  context.child.once('close', onClose);
  return async () => {
    context.child.removeListener('message', onMessage);
    context.child.removeListener('close', onClose);
    if (context.revocation) await context.revocation;
  };
}

function prepare(isLocal, identity) {
  if (!isLocal) return Object.freeze({ authority: null, environment: {} });
  const authority = signingAuthority.load();
  return Object.freeze({ authority, environment: environment(authority, identity) });
}

module.exports = { ACK_TYPE, DESCRIPTOR_TYPE, attach, prepare };
