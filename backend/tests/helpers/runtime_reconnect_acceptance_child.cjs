'use strict';

const capability = require('../../src/services/runtimeControlCapability');
const reconnectServer = require('../../src/services/localRuntimeReconnectServer');

let runtime;
let attachCount = 0;

function send(message) {
  if (process.connected) process.send(message);
}

function attach(channel, lineage, announceReady) {
  attachCount += 1;
  channel.on('message', message => {
    if (message?.type !== 'genos-runtime-control-request') return;
    channel.send({ type: 'genos-runtime-control-ack', requestId: message.requestId,
      action: message.action, lineage: message.lineage, proven: true, success: true,
      proofCode: 'RECONNECTED_CHILD_SAFE_POINT' });
  });
  if (announceReady) channel.send({
    type: capability.READY_TYPE, protocolVersion: capability.PROTOCOL_VERSION,
    lineage, actions: [...capability.ACTIONS]
  });
  send({ type: 'fixture-runtime-attached', attachCount });
}

async function start(message) {
  try {
    runtime = await reconnectServer.start({
      lineage: message.lineage, backendPublicKey: message.backendPublicKey,
      onAttach: channel => attach(channel, message.lineage, message.announceReady !== false)
    });
    send({ type: 'fixture-runtime-listening', descriptor: runtime.descriptor });
  } catch (error) {
    send({ type: 'fixture-runtime-error', detail: error.message });
  }
}

async function close() {
  await runtime?.close();
  process.exit(0);
}

process.on('message', message => {
  if (message?.type === 'fixture-start') void start(message);
  if (message?.type === 'fixture-close') void close();
});
