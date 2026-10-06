'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { createBridge, configuredEndpoint, observePersistedEvent } = require('../src/services/telemetryOtlpBridge');

const event = {
  eventType: 'EVIDENCE_REPORT', sessionId: 'mission-secret-id', agentId: 'worker-secret-id',
  status: 'SUCCESS', severity: 'info',
  payload: {
    tokensUsed: 42, costUsd: 0.25, evidenceReport: { outcome: 'success', content: 'TOP_SECRET' },
    prompt: 'TOP_SECRET', apiKey: 'TOP_SECRET'
  }
};

async function verifyAllowlist() {
  const exporter = new InMemorySpanExporter();
  const bridge = createBridge({ exporter, immediate: true, salt: 'test-salt' });
  assert.equal(bridge.observe(event), true);
  assert.equal(bridge.observe({ ...event, eventType: 'UNTRUSTED_SECRET_EVENT' }), false);
  assert.equal(bridge.observe({ ...event, eventType: 'AGENT_COMPLETED', agentId: 'other' }), true);
  await bridge.flush();
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 2);
  assert.equal(spans[0].attributes['genos.tokens'], 42);
  assert.equal(spans[0].attributes['genos.cost_usd'], 0.25);
  assert.equal(spans[0].attributes['genos.reported_outcome'], 'success');
  assert.equal(spans[0].attributes['genos.session_hash'], spans[1].attributes['genos.session_hash']);
  assert.ok(!JSON.stringify(spans.map((span) => span.attributes)).includes('TOP_SECRET'));
  assert.ok(!JSON.stringify(spans.map((span) => span.attributes)).includes('mission-secret-id'));
  await bridge.shutdown();
}

async function verifyOtlpHttp() {
  const received = [];
  const server = http.createServer((request, response) => {
    const parts = [];
    request.on('data', (part) => parts.push(part));
    request.on('end', () => {
      received.push({ path: request.url, body: Buffer.concat(parts) });
      response.writeHead(200);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/v1/traces';
    const bridge = createBridge({ exporter: new OTLPTraceExporter({ url }), immediate: true, salt: 'test-salt' });
    bridge.observe(event);
    await bridge.flush();
    assert.equal(received.length, 1);
    assert.equal(received[0].path, '/v1/traces');
    assert.ok(received[0].body.length > 0);
    assert.ok(!received[0].body.includes(Buffer.from('TOP_SECRET')));
    await bridge.shutdown();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function verifyPersistenceBoundary() {
  const databaseModule = require('../src/db');
  const bridgeModule = require('../src/services/telemetryOtlpBridge');
  const originalDatabase = databaseModule.getDatabase;
  const originalObserve = bridgeModule.observePersistedEvent;
  const observer = {
    persistQueue: [{ ...event, id: 'event-1', action: 'VERIFY', detail: 'TOP_SECRET' }],
    persistedEvents: 0, persistenceRetryDelayMs: 250,
    persistWorkspaceMilestone: async () => {}, pruneHistory: async () => {}
  };
  try {
    databaseModule.getDatabase = async () => ({ run: async () => {} });
    bridgeModule.observePersistedEvent = () => { throw new Error('collector unavailable'); };
    delete require.cache[require.resolve('../src/services/telemetryPersist')];
    await require('../src/services/telemetryPersist').drain(observer);
    assert.equal(observer.persistedEvents, 1);
    assert.equal(observer.persistQueue.length, 0);
  } finally {
    databaseModule.getDatabase = originalDatabase;
    bridgeModule.observePersistedEvent = originalObserve;
  }
}
async function main() {
  const before = process.env.GENOS_OTLP_TRACES_ENDPOINT;
  delete process.env.GENOS_OTLP_TRACES_ENDPOINT;
  assert.equal(observePersistedEvent(event), false);
  process.env.GENOS_OTLP_TRACES_ENDPOINT = 'http://example.com/v1/traces';
  assert.throws(() => configuredEndpoint());
  if (before === undefined) delete process.env.GENOS_OTLP_TRACES_ENDPOINT;
  else process.env.GENOS_OTLP_TRACES_ENDPOINT = before;
  await verifyAllowlist();
  await verifyOtlpHttp();
  await verifyPersistenceBoundary();
  console.log('OTLP bridge correlates safe counters and strips payload secrets.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });