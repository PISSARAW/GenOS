'use strict';

const protocol = require('./recoveredRuntimeSupervisionProtocol');

function create(descriptor) {
  let channel = null;
  let epoch = null;
  let sequence = 0;
  let terminal = false;

  function attach(next) {
    channel = next;
    epoch = protocol.freshEpoch();
    sequence = 0;
    terminal = false;
    next.once('close', () => { if (channel === next) channel = null; });
  }

  function publish(kind, payload) {
    if (!channel?.connected || terminal) return false;
    const message = protocol.create({ epoch, sequence: sequence + 1,
      runtimeInstanceId: descriptor.runtimeInstanceId,
      lineage: descriptor.lineage, kind, payload });
    if (!protocol.valid(message, descriptor)) return false;
    const sent = channel.send(message);
    if (!sent) return false;
    sequence += 1;
    if (kind === 'terminal') terminal = true;
    return true;
  }

  return Object.freeze({ attach, publish });
}

module.exports = { create };
