'use strict';

const { EventEmitter } = require('node:events');
const protocol = require('./recoveredRuntimeSupervisionProtocol');

const CAPABILITIES = Object.freeze({
  control: true, futureEvents: true, futureLogs: true,
  historicalLogs: false, childProcess: false, processExit: false,
  fullContext: false, cpuBudget: false
});

function attach(options) {
  const events = new EventEmitter();
  const channel = options.channel;
  const expected = { runtimeInstanceId: options.runtimeInstanceId,
    lineage: options.lineage };
  let epoch = null;
  let sequence = 0;
  let terminal = null;
  let closed = false;

  function reject(reason) {
    events.emit('protocolError', Object.assign(new Error(reason),
      { code: 'RECOVERED_SUPERVISION_PROTOCOL_INVALID' }));
    channel.destroy();
  }

  function receive(message) {
    if (message?.type !== protocol.TYPE) return;
    if (!protocol.valid(message, expected)) return reject('Invalid recovered supervision frame.');
    if (epoch === null) epoch = message.epoch;
    if (message.epoch !== epoch || message.sequence !== sequence + 1) {
      return reject('Recovered supervision frame is replayed or out of order.');
    }
    if (terminal) return reject('Recovered supervision continued after terminal declaration.');
    sequence = message.sequence;
    if (message.kind === 'terminal') terminal = Object.freeze({ ...message.payload });
    events.emit(message.kind, Object.freeze({ ...message.payload }));
  }

  function lost() {
    if (closed) return;
    closed = true;
    events.emit('lost', Object.freeze({ terminalDeclared: terminal !== null,
      lastSequence: sequence }));
  }

  channel.on('message', receive);
  channel.once('close', lost);
  return Object.freeze({
    kind: 'recovered-runtime-supervision', capabilities: CAPABILITIES, events,
    get terminalDeclaration() { return terminal; },
    get lastSequence() { return sequence; },
    close() {
      channel.removeListener('message', receive);
      channel.removeListener('close', lost);
      closed = true;
    }
  });
}

module.exports = { CAPABILITIES, attach };
