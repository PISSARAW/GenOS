'use strict';

const { activeProcesses } = require('./agentOrchestrationState');
const capability = require('./runtimeControlCapability');
const client = require('./runtimeControlReconnectClient');
const protocol = require('./runtimeControlReconnectProtocol');
const recoveredSupervisor = require('./recoveredRuntimeSupervisor');

const READY_TIMEOUT_MS = 5000;
const reservations = new Set();

function active(channel) {
  return channel?.connected === true && channel.exitCode == null;
}

function waitReady(channel, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Reassociated runtime did not attest readiness.')),
      timeoutMs);
    timer.unref?.();
    const onMessage = message => {
      if (message?.type === capability.READY_TYPE) done(null);
    };
    const onClose = () => done(new Error('Reassociated runtime closed before readiness.'));
    function done(error) {
      clearTimeout(timer);
      channel.removeListener('message', onMessage);
      channel.removeListener('close', onClose);
      if (error) reject(error); else resolve();
    }
    channel.on('message', onMessage);
    channel.once('close', onClose);
  });
}

function refuseExisting(workerId) {
  const existing = activeProcesses.get(workerId);
  if (!active(existing)) return existing;
  throw new Error('An active runtime channel already owns this worker.');
}

function reserve(workerId) {
  if (reservations.has(workerId)) throw new Error('Runtime reassociation is already in progress.');
  reservations.add(workerId);
}

async function perform(options, lineage) {
  const observed = refuseExisting(lineage.workerId);
  const channel = await client.connect(options);
  capability.bind(channel);
  const ready = waitReady(channel, options.readyTimeoutMs || READY_TIMEOUT_MS);
  channel.activate();
  try { await ready; } catch (error) { channel.destroy(); throw error; }
  if (!capability.supports(channel, 'pause')) {
    channel.destroy();
    throw new Error('Reassociated runtime capability is unproven.');
  }
  if (activeProcesses.get(lineage.workerId) !== observed) {
    channel.destroy();
    throw new Error('Runtime ownership changed during reassociation.');
  }
  channel.genosRecoveredSupervisor = recoveredSupervisor.attach({ channel, lineage,
    runtimeInstanceId: channel.genosRuntimeInstanceId });
  activeProcesses.set(lineage.workerId, channel);
  channel.once('close', () => {
    if (activeProcesses.get(lineage.workerId) === channel) activeProcesses.delete(lineage.workerId);
  });
  return Object.freeze({
    proven: true, code: 'RUNTIME_CONTROL_REASSOCIATED',
    workerId: lineage.workerId, runtimeInstanceId: channel.genosRuntimeInstanceId,
    pid: channel.pid
  });
}

async function reassociate(options) {
  const lineage = options?.descriptor?.lineage;
  if (!lineage?.workerId || !protocol.exactLineage(lineage, options.expectedLineage)) {
    throw new Error('Reconnect lineage does not match the expected authority.');
  }
  reserve(lineage.workerId);
  try { return await perform(options, lineage); }
  finally { reservations.delete(lineage.workerId); }
}

module.exports = { READY_TIMEOUT_MS, reassociate };
