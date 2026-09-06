const path = require('path');
const protobuf = require('protobufjs');

const root = new protobuf.Root();
root.loadSync(path.resolve(__dirname, '../../proto/agent.proto'));
root.loadSync(path.resolve(__dirname, '../../proto/telemetry.proto'));
const Mission = root.lookupType('genos.agent.v1.AgentMission');
const Event = root.lookupType('genos.telemetry.v1.AgentEvent');
const MAX_FRAME_BYTES = 1024 * 1024;

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

function decodeMissionInput(buffer) {
  try {
    return decodeMission(buffer);
  } catch (binaryError) {
    try {
      const value = JSON.parse(buffer.toString('utf8').trim());
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Mission must be a JSON object');
      return value;
    } catch {
      throw binaryError;
    }
  }
}

function decodeEvents(buffer, onEvent) {
  let remaining = buffer;
  while (remaining.length >= 4) {
    const size = remaining.readUInt32BE(0);
    if (size > MAX_FRAME_BYTES) throw new RangeError(`Runtime event frame exceeds ${MAX_FRAME_BYTES} bytes.`);
    if (remaining.length < size + 4) break;
    const message = Event.decode(remaining.subarray(4, size + 4));
    onEvent(Event.toObject(message, { defaults: false }));
    remaining = remaining.subarray(size + 4);
  }
  return remaining;
}

module.exports = { encodeMission, encodeEvent, decodeMission, decodeMissionInput, decodeEvents, MAX_FRAME_BYTES };
