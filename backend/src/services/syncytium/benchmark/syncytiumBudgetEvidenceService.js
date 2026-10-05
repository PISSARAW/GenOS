'use strict';

async function measure(db, members, budget) {
  const workers = await Promise.all(members.map((member) => readWorker(db, member, budget)));
  const observed = {
    tokens: sumMeasured(workers, 'tokens'),
    events: sumMeasured(workers, 'events'),
    costUsd: sumMeasured(workers, 'costUsd')
  };
  return { workers, observed,
    measured: workers.length > 0 && workers.every((worker) => worker.measured),
    verified: workers.length > 0 && workers.every((worker) => worker.verified) };
}

async function readWorker(db, member, budget) {
  const workerId = member.workerId;
  if (!workerId) return { workerId: null, measured: false, verified: false, reason: 'missing_worker_id' };
  const completion = await db.get(`SELECT payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type = 'AGENT_COMPLETED' ORDER BY id DESC LIMIT 1`, workerId);
  const raw = await db.all(`SELECT payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type = 'AGENT_STEP' ORDER BY id`, workerId);
  const usage = parse(completion?.payload_json)?.usage;
  const observations = raw.map((row) => parse(row.payload_json));
  const measurement = { tokens: observations.some((event) => reportedTokens(event)),
    events: Number.isSafeInteger(usage?.events),
    costUsd: observations.some((event) => reportedCost(event)) };
  const measured = Boolean(usage) && Object.values(measurement).every(Boolean);
  const normalized = usage ? { tokens: Number(usage.tokens), events: Number(usage.events),
    costUsd: Number(usage.cost_usd) } : null;
  const within = normalized && ['tokens', 'events', 'costUsd'].every((key) =>
    Number.isFinite(normalized[key]) && normalized[key] >= 0
    && (budget[key] === undefined || normalized[key] <= budget[key]));
  return { workerId, usage: normalized, measurement, measured, within: Boolean(within),
    verified: measured && Boolean(within),
    reason: !completion ? 'missing_completion_receipt' : !measured ? 'provider_usage_unmeasured'
      : !within ? 'worker_budget_exceeded' : null };
}

function sumMeasured(workers, key) {
  if (!workers.length || workers.some((worker) => !worker.measurement?.[key]
    || !Number.isFinite(worker.usage?.[key]))) return null;
  return workers.reduce((sum, worker) => sum + worker.usage[key], 0);
}

function reportedTokens(event) {
  const usage = event?.usage || event?.payload?.usage;
  return Number.isFinite(usage?.total_tokens)
    || (Number.isFinite(usage?.input_tokens) && Number.isFinite(usage?.output_tokens));
}

function reportedCost(event) {
  const usage = event?.usage || event?.payload?.usage;
  return Number.isFinite(event?.cost_usd) || Number.isFinite(usage?.cost_usd);
}

function parse(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

module.exports = { measure };
