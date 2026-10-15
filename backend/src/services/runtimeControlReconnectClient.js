'use strict';

const net = require('node:net');
const protocol = require('./runtimeControlReconnectProtocol');
const { RuntimeControlReconnectChannel } = require('./runtimeControlReconnectChannel');

const CONNECT_TIMEOUT_MS = 5000;

function finish(context, error, channel) {
  if (context.settled) return;
  context.settled = true;
  clearTimeout(context.timer);
  context.channel.removeListener('message', context.onMessage);
  context.channel.removeListener('close', context.onClose);
  context.channel.removeListener('error', context.onError);
  if (error) {
    context.channel.destroy();
    context.reject(error);
  } else context.resolve(channel);
}

function decorate(channel, context) {
  channel.genosControlIdentity = Object.freeze({ ...context.descriptor.lineage });
  channel.pid = context.descriptor.processIdentity.pid;
  channel.genosRuntimeInstanceId = context.descriptor.runtimeInstanceId;
  channel.activate = () => channel.send({
    type: protocol.ACTIVATE, protocolVersion: protocol.VERSION,
    reconnectId: context.challenge.reconnectId
  });
  return channel;
}

function awaitResponse(context) {
  context.onMessage = message => {
    const valid = protocol.validResponse(message, {
      challenge: context.challenge, descriptor: context.descriptor
    });
    finish(context, valid ? null : new Error('Runtime reconnect proof is invalid.'),
      valid ? decorate(context.channel, context) : null);
  };
  context.onClose = () => finish(context, new Error('Runtime reconnect channel closed.'));
  context.onError = () => finish(context, new Error('Runtime reconnect transport failed.'));
  context.channel.once('message', context.onMessage);
  context.channel.once('close', context.onClose);
  context.channel.once('error', context.onError);
  context.timer = setTimeout(() => finish(context, new Error('Runtime reconnect timed out.')),
    context.timeoutMs);
  context.timer.unref?.();
  context.channel.send(context.challenge, error => {
    if (error) finish(context, new Error('Runtime reconnect challenge could not be sent.'));
  });
}

function connect(options) {
  if (!protocol.validDescriptor(options?.descriptor)) {
    return Promise.reject(new Error('Invalid reconnect descriptor.'));
  }
  let challenge;
  try { challenge = protocol.createChallenge(options); }
  catch (error) { return Promise.reject(error); }
  const socket = net.connect(options.descriptor.endpoint);
  const channel = new RuntimeControlReconnectChannel(socket);
  const timeoutMs = Math.min(10000, Math.max(100, options.timeoutMs || CONNECT_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const context = { ...options, channel, challenge, timeoutMs, resolve, reject, settled: false };
    awaitResponse(context);
  });
}

module.exports = { CONNECT_TIMEOUT_MS, connect };
