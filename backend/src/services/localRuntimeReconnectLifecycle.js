'use strict';

const crypto = require('node:crypto');
const protocol = require('./runtimeControlReconnectProtocol');
const bootstrap = require('./localRuntimeReconnectBootstrap');
const provisioning = require('./runtimeControlReconnectProvisioning');

const ACK_TIMEOUT_MS = 5000;

function configured(environment) {
  return Boolean(environment.GENOS_RUNTIME_CONTROL_BACKEND_PUBLIC_B64
    || environment.GENOS_RUNTIME_CONTROL_BACKEND_KEY_ID);
}

function authority(environment) {
  const encoded = environment.GENOS_RUNTIME_CONTROL_BACKEND_PUBLIC_B64;
  const expectedId = environment.GENOS_RUNTIME_CONTROL_BACKEND_KEY_ID;
  if (!encoded || !expectedId) throw new Error('Runtime reconnect public authority is incomplete.');
  const publicKey = Buffer.from(encoded, 'base64url').toString();
  if (protocol.keyId(publicKey) !== expectedId) {
    throw new Error('Runtime reconnect public authority key id is invalid.');
  }
  return publicKey;
}

function configure(state, environment = process.env) {
  if (!configured(environment)) return null;
  let lineage;
  try {
    lineage = JSON.parse(Buffer.from(environment.GENOS_RUNTIME_CONTROL_LINEAGE_B64 || '',
      'base64url').toString());
  } catch (_) { throw new Error('Runtime reconnect lineage is invalid.'); }
  const keys = ['workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'];
  if (Object.keys(lineage || {}).sort().join('\0') !== keys.sort().join('\0')
    || !protocol.exactLineage(lineage, lineage)) {
    throw new Error('Runtime reconnect lineage is incomplete.');
  }
  state.controlLineage = Object.freeze({ ...lineage });
  return state.controlLineage;
}

function persistDescriptor(descriptor) {
  return new Promise((resolve, reject) => {
    if (!process.connected || typeof process.send !== 'function') {
      return reject(new Error('Parent IPC is unavailable for descriptor persistence.'));
    }
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => done(new Error('Reconnect descriptor persistence timed out.')),
      ACK_TIMEOUT_MS);
    timer.unref?.();
    const onMessage = message => {
      if (message?.type !== provisioning.ACK_TYPE || message.requestId !== requestId) return;
      const error = message.proven === true && message.code === 'RECONNECT_DESCRIPTOR_DURABLE'
        ? null : new Error('Reconnect descriptor persistence was refused.');
      done(error, message);
    };
    function done(error, value) {
      clearTimeout(timer);
      process.removeListener('message', onMessage);
      if (error) reject(error); else resolve(value);
    }
    process.on('message', onMessage);
    process.send({ type: provisioning.DESCRIPTOR_TYPE, requestId, descriptor }, error => {
      if (error) done(error);
    });
  });
}

async function start(state, environment = process.env) {
  if (!configured(environment)) return null;
  const runtime = await bootstrap.start({
    lineage: state.controlLineage || configure(state, environment),
    backendPublicKey: authority(environment), persistDescriptor
  });
  return Object.freeze({ close: runtime.close, descriptor: runtime.descriptor,
    supervision: runtime.supervision });
}

async function close(state) {
  if (!state.reconnectRuntime) return;
  await state.reconnectRuntime.close();
  state.reconnectRuntime = null;
}

module.exports = { close, configure, start };
