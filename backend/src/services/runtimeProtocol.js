const path = require('path');
const protobuf = require('protobufjs');

const root = protobuf.loadSync(path.resolve(__dirname, '../../proto/genos_runtime.proto'));
const Mission = root.lookupType('genos.runtime.v1.AgentMission');
const Event = root.lookupType('genos.runtime.v1.AgentEvent');

function frame(buffer) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(buffer.length, 0);
  return Buffer.concat([header, buffer]);
}

function encodeMission(mission) {
  const message = Mission.create(mission);
  return frame(Buffer.from(Mission.encode(message).finish()));
}

function encodeEvent(event) {
  const message = Event.create({
    agentId: event.agentId || '',
    eventType: event.eventType || 'AGENT_STEP',
    action: event.action || 'EXECUTE',
    detail: event.detail || '',
    severity: event.severity || 'info',
    status: event.status || '',
    currentTask: event.currentTask || '',
    payloadJson: typeof event.payloadJson === 'string' ? event.payloadJson : JSON.stringify(event.payload || {})
  });
  return frame(Buffer.from(Event.encode(message).finish()));
}

function decodeMission(buffer) {
  if (buffer.length < 4) throw new Error('Mission frame is incomplete');
  const size = buffer.readUInt32BE(0);
  if (buffer.length < size + 4) throw new Error('Mission payload is incomplete');
  const message = Mission.decode(buffer.subarray(4, size + 4));
  return Mission.toObject(message, { defaults: false });
}

function decodeEvents(buffer, onEvent) {
  let remaining = buffer;
  while (remaining.length >= 4) {
    const size = remaining.readUInt32BE(0);
    if (remaining.length < size + 4) break;
    const message = Event.decode(remaining.subarray(4, size + 4));
    onEvent(Event.toObject(message, { defaults: false }));
    remaining = remaining.subarray(size + 4);
  }
  return remaining;
}

module.exports = { encodeMission, encodeEvent, decodeMission, decodeEvents };
