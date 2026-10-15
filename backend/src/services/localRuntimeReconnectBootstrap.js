'use strict';

const reconnectServer = require('./localRuntimeReconnectServer');
const cooperativeControl = require('./localRuntimeCooperativeControl');
const supervisionPublisher = require('./recoveredRuntimeSupervisionPublisher');

async function start(options) {
  if (typeof options?.persistDescriptor !== 'function') {
    throw new Error('A durable reconnect descriptor writer is required.');
  }
  let supervision;
  const runtime = await reconnectServer.start({
    lineage: options.lineage,
    backendPublicKey: options.backendPublicKey,
    onAttach(channel, descriptor) {
      cooperativeControl.attachChannel(channel);
      if (!supervision) supervision = supervisionPublisher.create(descriptor);
      supervision.attach(channel);
    }
  });
  try {
    await options.persistDescriptor(runtime.descriptor);
    if (!cooperativeControl.armReconnectGrace(options.graceMs || 30000)) {
      throw new Error('Reconnect grace policy is invalid.');
    }
  } catch (error) {
    await runtime.close();
    throw error;
  }
  return Object.freeze({ descriptor: runtime.descriptor, close: runtime.close,
    supervision: Object.freeze({
      publish: (kind, payload) => supervision?.publish(kind, payload) === true
    }) });
}

module.exports = { start };
