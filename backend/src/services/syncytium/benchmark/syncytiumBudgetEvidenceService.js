'use strict';

async function measure(db, members, budget) {
  const workers = await Promise.all(members.map((member) => readWorker(db, member, budget)));
  const observed = {
    tokens: workers.reduce((sum, worker) => sum + (worker.usage?.tokens || 0), 0),
    events: workers.reduce((sum, worker) => sum + (worker.usage?.events || 0), 0),
    costUsd: workers.reduce((sum, worker) => sum + (worker.usage?.costUsd || 0), 0)
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
  const measured = Boolean(usage) && observations.some((event) => reportedTokens(event))
    && observations.some((event) => reportedCost(event));
  const normalized = usage ? { tokens: Number(usage.tokens), events: Number(usage.events),
    costUsd: Number(usage.cost_usd) } : null;
  const within = normalized && ['tokens', 'events', 'costUsd'].every((key) =>
    Number.isFinite(normalized[key]) && normalized[key] >= 0
    && (budget[key] === undefined || normalized[key] <= budget[key]));
  return { workerId, usage: normalized, measured, within: Boolean(within),
    verified: measured && Boolean(within),
    reason: !completion ? 'missing_completion_receipt' : !measured ? 'provider_usage_unmeasured'
      : !within ? 'worker_budget_exceeded' : null };
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
