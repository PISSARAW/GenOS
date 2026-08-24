/**
 * Inference gateway tests: bounded concurrency against a fake
 * OpenAI-compatible GPU server, priority lanes, and queue rejection.
 */
const assert = require('assert');
const http = require('http');
const modelProvider = require('./src/services/modelProvider');
const gateway = require('./src/services/inferenceGatewayService');

async function startFakeGpuServer() {
  let inFlight = 0;
  let peak = 0;
  const server = http.createServer((request, response) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => {
      inFlight -= 1;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        choices: [{ message: { content: 'generated' } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 }
      }));
    }, 25);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, peakReport: () => peak };
}

async function main() {
  const { server, port, peakReport } = await startFakeGpuServer();
  process.env.GENOS_INFERENCE_MAX_CONCURRENT = '3';
  gateway.reset();

  // Eight simultaneous worker generations against one GPU server: the
  // gateway must never let more than 3 hit the wire at once.
  const calls = Array.from({ length: 8 }, (_, index) => modelProvider.generate({
    model: `vllm://test-model-${index}`,
    prompt: `prompt ${index}`,
    endpoint: `http://127.0.0.1:${port}/v1/chat/completions`
  }));
  const results = await Promise.all(calls);
  assert.strictEqual(results.length, 8);
  assert.ok(results.every((result) => result.text === 'generated'), 'every call generated');
  assert.ok(peakReport() <= 3, `peak concurrency ${peakReport()} must respect the cap of 3`);
  console.log(`bounded concurrency OK: 8 calls, peak in-flight ${peakReport()}`);

  // Priority lane: with a limit of 3, three bulk tasks occupy the slots and
  // bulk-3 waits in queue; a late interactive task must jump ahead of it.
  gateway.reset();
  const order = [];
  const gate = new Promise((resolve) => { global.__openGate = resolve; });
  const bulk = Array.from({ length: 4 }, (_, index) => gateway.schedule(
    () => gate.then(() => order.push(`bulk-${index}`)),
    { provider: 'vllm', priority: 'bulk' }
  ).catch(() => order.push(`bulk-${index}-failed`)));
  const interactive = gateway.schedule(async () => { order.push('interactive'); }, { provider: 'vllm', priority: 'interactive' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  global.__openGate();
  await Promise.all([...bulk, interactive]);
  assert.strictEqual(order[3], 'interactive', `interactive must precede the queued bulk-3, got ${order.join(',')}`);
  assert.strictEqual(order[4], 'bulk-3', `bulk-3 must run after the interactive task, got ${order.join(',')}`);
  console.log('priority lane OK:', order.join(' < '));

  // Queue capacity: exceeding the capacity rejects instead of growing without bound.
  gateway.reset();
  process.env.GENOS_INFERENCE_MAX_CONCURRENT = '1';
  process.env.GENOS_INFERENCE_QUEUE_CAPACITY = '2';
  process.env.GENOS_INFERENCE_QUEUE_TIMEOUT_MS = '0';
  const blocked = new Promise((resolve) => { global.__openGate = resolve; });
  const held = gateway.schedule(() => blocked, { provider: 'vllm' });
  const filler = [gateway.schedule(() => {}, { provider: 'vllm' }), gateway.schedule(() => {}, { provider: 'vllm' })];
  const overflow = gateway.schedule(() => {}, { provider: 'vllm' });
  let rejected = false;
  try {
    await overflow;
  } catch (error) {
    rejected = error.code === 'INFERENCE_QUEUE_FULL';
  }
  assert.ok(rejected, 'overflow task must be rejected with INFERENCE_QUEUE_FULL');
  global.__openGate();
  await Promise.allSettled([held, ...filler]);
  console.log('queue rejection OK');
  delete process.env.GENOS_INFERENCE_QUEUE_CAPACITY;
  delete process.env.GENOS_INFERENCE_QUEUE_TIMEOUT_MS;
  delete process.env.GENOS_INFERENCE_MAX_CONCURRENT;

  server.close();
  console.log('Inference gateway: all assertions passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
