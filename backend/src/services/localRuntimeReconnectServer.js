'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const protocol = require('./runtimeControlReconnectProtocol');
const { RuntimeControlReconnectChannel } = require('./runtimeControlReconnectChannel');

const MAX_REPLAYS = 1024;
const HANDSHAKE_TIMEOUT_MS = 5000;

function publicPem(key) {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function remember(state, reconnectId) {
  if (state.replays.has(reconnectId) || state.replayOrder.length >= MAX_REPLAYS) return false;
  state.replays.add(reconnectId);
  state.replayOrder.push(reconnectId);
  return true;
}

function exactActivation(message, challenge) {
  return message?.type === protocol.ACTIVATE && message.protocolVersion === protocol.VERSION
    && message.reconnectId === challenge.reconnectId
    && Object.keys(message).sort().join('\0')
      === ['type', 'protocolVersion', 'reconnectId'].sort().join('\0');
}

function activate(state, channel, challenge) {
  const onMessage = message => {
    if (!exactActivation(message, challenge)) return channel.destroy();
    clearTimeout(channel.genosHandshakeTimer);
    channel.removeListener('message', onMessage);
    state.activeChannel?.destroy();
    state.activeChannel = channel;
    channel.once('close', () => {
      if (state.activeChannel === channel) state.activeChannel = null;
    });
    state.onAttach(channel, state.descriptor);
  };
  channel.on('message', onMessage);
}

function authenticate(state, channel, message) {
  const context = { descriptor: state.descriptor, backendPublicKey: state.backendPublicKey };
  if (!protocol.validChallenge(message, context) || !remember(state, message.reconnectId)) {
    return channel.destroy();
  }
  const response = protocol.createResponse({
    challenge: message, descriptor: state.descriptor, runtimePrivateKey: state.runtimePrivateKey
  });
  channel.removeAllListeners('message');
  channel.send(response, error => {
    if (error) channel.destroy();
    else activate(state, channel, message);
  });
}

function accept(state, socket) {
  const channel = new RuntimeControlReconnectChannel(socket);
  channel.genosHandshakeTimer = setTimeout(() => channel.destroy(), HANDSHAKE_TIMEOUT_MS);
  channel.genosHandshakeTimer.unref?.();
  channel.once('message', message => authenticate(state, channel, message));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      server.removeListener('error', reject);
      resolve(server.address());
    });
  });
}

async function start(options) {
  if (typeof options?.onAttach !== 'function') throw new Error('Reconnect attach handler required.');
  const keys = crypto.generateKeyPairSync('ed25519');
  const state = {
    backendPublicKey: options.backendPublicKey, runtimePrivateKey: keys.privateKey,
    onAttach: options.onAttach, descriptor: null, activeChannel: null,
    replays: new Set(), replayOrder: []
  };
  const server = net.createServer(socket => accept(state, socket));
  const address = await listen(server);
  state.descriptor = protocol.descriptor({
    endpoint: { host: address.address, port: address.port },
    runtimeInstanceId: crypto.randomUUID(), lineage: options.lineage,
    processIdentity: { pid: process.pid, startMarker: crypto.randomUUID() },
    runtimePublicKey: publicPem(keys.publicKey),
    backendKeyId: protocol.keyId(options.backendPublicKey)
  });
  return Object.freeze({
    descriptor: state.descriptor,
    close: () => new Promise(resolve => {
      state.activeChannel?.destroy();
      server.close(() => resolve());
    })
  });
}

module.exports = { HANDSHAKE_TIMEOUT_MS, start };
