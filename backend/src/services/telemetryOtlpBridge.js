'use strict';

const crypto = require('node:crypto');

const EVENT_NAMES = Object.freeze({
  AGENT_STARTED: 'genos.agent.started',
  AGENT_COMPLETED: 'genos.agent.completed',
  AGENT_FAILED: 'genos.agent.failed',
  EVIDENCE_REPORT: 'genos.evidence.reported',
  TOOL_CALL_COMPLETED: 'genos.tool.completed',
  TOKEN_ROUND_EVALUATED: 'genos.budget.evaluated',
  TOKEN_ROUND_FAILED: 'genos.budget.failed'
});
const STATUSES = new Set(['SUCCESS', 'FAILED', 'ERROR', 'UNVERIFIED']);
const SEVERITIES = new Set(['info', 'warn', 'error']);
const OUTCOMES = new Set(['success', 'failure', 'unverified']);
const NUMBER_LIMITS = Object.freeze({ 'genos.tokens': 1e9, 'genos.cost_usd': 1e6 });
const PROCESS_SALT = crypto.randomBytes(32).toString('hex');
let defaultBridge;
let warned = false;

function hashId(value, salt) {
  if (typeof value !== 'string' || !value || value.length > 200) return null;
  return crypto.createHash('sha256').update(salt).update('\0').update(value).digest('hex').slice(0, 32);
}

function addNumber(attributes, key, value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= NUMBER_LIMITS[key]) {
    attributes[key] = value;
  }
}

function safeAttributes(event, salt) {
  const attributes = {};
  const session = hashId(event.sessionId, salt);
  const agent = hashId(event.agentId, salt);
  if (session) attributes['genos.session_hash'] = session;
  if (agent) attributes['genos.agent_hash'] = agent;
  if (STATUSES.has(event.status)) attributes['genos.status'] = event.status;
  if (SEVERITIES.has(event.severity)) attributes['genos.severity'] = event.severity;
  const payload = event.payload || {};
  addNumber(attributes, 'genos.tokens', payload.tokensUsed);
  addNumber(attributes, 'genos.cost_usd', payload.costUsd);
  if (event.eventType === 'EVIDENCE_REPORT') {
    const outcome = payload.evidenceReport?.outcome;
    if (OUTCOMES.has(outcome)) attributes['genos.reported_outcome'] = outcome;
  }
  return attributes;
}

function createBridge(options) {
  const { BasicTracerProvider, BatchSpanProcessor, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
  const processor = options.immediate
    ? new SimpleSpanProcessor(options.exporter)
    : new BatchSpanProcessor(options.exporter);
  const provider = new BasicTracerProvider({ spanProcessors: [processor] });
  const tracer = provider.getTracer('genos.telemetry', '1');
  const salt = options.salt || PROCESS_SALT;
  return {
    observe(event) {
      const name = EVENT_NAMES[event?.eventType];
      if (!name) return false;
      const span = tracer.startSpan(name, { attributes: safeAttributes(event, salt) });
      span.end();
      return true;
    },
    flush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown()
  };
}

function configuredEndpoint() {
  const raw = process.env.GENOS_OTLP_TRACES_ENDPOINT;
  if (!raw) return null;
  const endpoint = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
  if (endpoint.pathname !== '/v1/traces' || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback))) {
    throw new Error('GENOS_OTLP_TRACES_ENDPOINT must use HTTPS or loopback HTTP and end in /v1/traces');
  }
  return raw;
}

function observePersistedEvent(event) {
  try {
    const endpoint = configuredEndpoint();
    if (!endpoint) return false;
    if (!defaultBridge) {
      const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
      defaultBridge = createBridge({ exporter: new OTLPTraceExporter({ url: endpoint }),
        salt: process.env.GENOS_OTEL_HASH_SALT });
    }
    return defaultBridge.observe(event);
  } catch (_) {
    if (!warned) console.warn('[GenOS OTel] Trace export unavailable; persisted telemetry remains authoritative.');
    warned = true;
    return false;
  }
}

module.exports = { createBridge, observePersistedEvent, safeAttributes, configuredEndpoint };