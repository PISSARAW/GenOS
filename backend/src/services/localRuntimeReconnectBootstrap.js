'use strict';

const reconnectServer = require('./localRuntimeReconnectServer');
const cooperativeControl = require('./localRuntimeCooperativeControl');

async function start(options) {
  if (typeof options?.persistDescriptor !== 'function') {
    throw new Error('A durable reconnect descriptor writer is required.');
  }
  if (!cooperativeControl.armReconnectGrace(options.graceMs || 30000)) {
    throw new Error('Reconnect grace policy is invalid.');
  }
  const runtime = await reconnectServer.start({
    lineage: options.lineage,
    backendPublicKey: options.backendPublicKey,
    onAttach: channel => cooperativeControl.attachChannel(channel)
  });
  try {
    await options.persistDescriptor(runtime.descriptor);
  } catch (error) {
    await runtime.close();
    throw error;
  }
  return runtime;
}

module.exports = { start };
