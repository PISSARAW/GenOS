import assert from 'node:assert/strict';
import { parseFrame, readEvents } from '../../integrations/studio/events.mjs';
import { metric } from '../../integrations/studio/metrics.mjs';
assert.deepEqual(parseFrame(': heartbeat'), null);
assert.deepEqual(parseFrame('data: {"id":"one"}'), { id: 'one' });
const encoder = new TextEncoder();
const frames = ['data: {"id":', '"one"}\r\n\r\ndata: {"id":"two"}\n\n'];
const body = new ReadableStream({ start(controller) {
  frames.forEach(text => controller.enqueue(encoder.encode(text)));
  controller.close();
} });
const events = [];
await readEvents(body, event => events.push(event.id));
assert.deepEqual(events, ['one', 'two']);
assert.equal(metric(0), 'Inconnu');
assert.equal(metric(undefined), 'Inconnu');
assert.equal(metric(0, 'mesuré', true), '0 (mesuré)');
console.log('Studio SSE: fragmented frames, heartbeat and unknown metrics passed.');
