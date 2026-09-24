'use strict';

const subscriptions = require('./subscriptionPlanner');
const staleness = require('./stalenessBudgetService');
const backpressure = require('./backpressureService');

function plan({ operation, schema, domains, telemetry = {}, coordination }) {
  const path = String(operation?.kind?.key || (operation?.kind?.type?.endsWith('_text') ? 'textContent' : '')).trim();
  const field = schema?.fields?.[path] || null;
  const pressure = backpressure.assess(telemetry);
  const recipients = subscriptions.recipients(path, schema, domains).map((domainId) => {
    const domain = domains[domainId];
    const freshness = staleness.assess({ domain, field, path, telemetry, nowMs: telemetry.nowMs });
    return { domainId, freshness, strategy: strategyFor({ operation, coordination, pressure, freshness }) };
  });
  return { path, pressure, recipients };
}

function strategyFor({ operation, coordination, pressure, freshness }) {
  if (coordination?.classification === 'RED' || isCritical(operation) || freshness.stale) return 'IMMEDIATE';
  if (pressure.action === 'SLOW_PRODUCER') return 'SLOW_PRODUCER';
  if (pressure.action === 'BATCH_LOW_PRIORITY' && !isHighPriority(operation)) return 'BATCH';
  return 'REALTIME';
}

function isCritical(operation) {
  return ['critical', 'security'].includes(String(operation.priority || '').toLowerCase());
}

function isHighPriority(operation) {
  return ['high', 'critical', 'security'].includes(String(operation.priority || '').toLowerCase());
}

module.exports = { plan };
