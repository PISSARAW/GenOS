'use strict';

const { PROTOCOL_VERSION, RENEW_TYPE } = require('./runtimeControlCapabilityLease');

const RENEW_INTERVAL_MS = 10000;
const LINEAGE_FIELDS = Object.freeze([
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
]);

function validLineage(lineage) {
  return LINEAGE_FIELDS.every(field => typeof lineage?.[field] === 'string'
    && lineage[field].length > 0 && lineage[field].length <= 512);
}

function createContext(lineage, options) {
  const channel = options.channel || process;
  return {
    lineage: Object.freeze({ ...lineage }), channel,
    schedule: options.schedule || setInterval,
    cancel: options.cancel || clearInterval,
    intervalMs: options.intervalMs || RENEW_INTERVAL_MS,
    sequence: 0, timer: null, stopped: false
  };
}

function stop(context) {
  if (context.stopped) return;
  context.stopped = true;
  if (context.timer) context.cancel(context.timer);
  context.channel.removeListener?.('disconnect', context.onDisconnect);
}

function pulse(context) {
  if (context.stopped || context.channel.connected !== true
    || typeof context.channel.send !== 'function') return stop(context);
  context.sequence += 1;
  const message = {
    type: RENEW_TYPE, protocolVersion: PROTOCOL_VERSION,
    sequence: context.sequence, lineage: context.lineage
  };
  try {
    context.channel.send(message, error => { if (error) stop(context); });
  } catch (_) {
    stop(context);
  }
}

function start(lineage, options = {}) {
  if (!validLineage(lineage)) throw new Error('Runtime control lease requires exact lineage.');
  const context = createContext(lineage, options);
  context.onDisconnect = () => stop(context);
  context.channel.once?.('disconnect', context.onDisconnect);
  context.timer = context.schedule(() => pulse(context), context.intervalMs);
  context.timer?.unref?.();
  return Object.freeze({ stop: () => stop(context) });
}

module.exports = { RENEW_INTERVAL_MS, start };
