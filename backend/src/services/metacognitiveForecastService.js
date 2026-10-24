'use strict';

const { digest } = require('./biologicalIntegrity');
const store = require('./metacognitiveForecastStore');
const evidenceValidation = require('./morphogenesis/learning/outcomeEvidenceValidation');
const negative = require('./terminalOutcomeEvidence');
const SCHEMA = 'genos.metacognitive-forecast/v1';
const TERMINAL = new Set(['completed', 'failed', 'blocked', 'cancelled', 'awaiting_approval']);

function reject(reason) {
  throw Object.assign(new Error(reason), { code: 'METACOGNITIVE_FORECAST_INVALID' });
}

function probability(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) reject('Probability must be a finite number in [0,1].');
  return value;
}

async function prior(db, input) {
  if (input.probability !== undefined) return { probability: probability(input.probability), source: 'caller_prior' };
  const row = await db.get("SELECT payload_json FROM adaptive_state WHERE scope='orchestrator_self_model' AND key=?", input.agentId);
  const learned = row ? JSON.parse(row.payload_json) : {};
  return { probability: probability(learned.expectedSuccess ?? 0.58), source: 'operational_success_prior' };
}

function forecastOf(row) {
  if (!row) return null;
  const forecast = JSON.parse(row.forecast_json);
  const bound = forecast.schema === SCHEMA && forecast.runId === row.run_id
    && forecast.agentId === row.agent_id && forecast.organizationId === row.organization_id
    && forecast.projectId === row.project_id && forecast.createdAt === row.created_at;
  if (!bound || digest(forecast) !== row.forecast_hash) reject('Forecast integrity or scope mismatch.');
  probability(forecast.probability);
  return forecast;
}

async function capture(db, input) {
  await store.ensure(db);
  const existing = forecastOf(await store.read(db, input.runId));
  if (existing) {
    if (existing.agentId !== input.agentId) reject('Forecast agent mismatch.');
    if (input.probability !== undefined && existing.probability !== input.probability) reject('Forecast is immutable.');
    return { status: 'recorded', replayed: true, forecast: existing };
  }
  const run = await db.get('SELECT id,agent_id,status FROM strategy_execution_runs WHERE id=?', input.runId);
  if (run?.agent_id !== input.agentId || run.status !== 'planned') reject('A matching planned run is required before execution.');
  const binding = await store.scope(db, input.agentId);
  if (!binding) reject('Agent scope is unavailable.');
  const forecast = { schema: SCHEMA, ...binding, runId: input.runId,
    ...await prior(db, input), target: 'independently_verified_task_success', createdAt: new Date().toISOString() };
  await store.insert(db, forecast, digest(forecast));
  const saved = forecastOf(await store.read(db, input.runId));
  if (digest(saved) !== digest(forecast)) reject('Concurrent forecast conflict.');
  return { status: 'recorded', replayed: false, forecast: saved };
}

async function captureSafe(db, input) {
  try { return await capture(db, input); }
  catch (error) { return { status: 'unavailable', reason: error.code || 'forecast_storage_unavailable' }; }
}

function resolutionEvidence(event) {
  if (event?.eventType === 'AGENT_COMPLETED') return event.payload?.qualityEvidence;
  if (negative.FAILURE_EVENTS.has(event?.eventType)) return event.payload?.negativeOutcomeEvidence;
  return null;
}

function validResolution(forecast, resolution) {
  const event = resolution.event;
  const evidence = resolutionEvidence(event);
  const binding = { ...forecast, actionId: forecast.runId };
  if (event?.payload?.executionRunId !== forecast.runId || !evidenceValidation.validate(evidence, binding)) return false;
  if (negative.FAILURE_EVENTS.has(event.eventType) && !negative.validateNegativeOutcome({ event, evidence, binding })) return false;
  const checked = Date.parse(evidence.receipt.checkedAt);
  return Number.isFinite(checked) && checked >= Date.parse(forecast.createdAt)
    && checked <= Date.parse(resolution.observedAt)
    && resolution.outcome === Number(evidence.success);
}

async function observe(db, input) {
  if (!resolutionEvidence(input.event)) return { status: 'unavailable', reason: 'independent_resolution_missing' };
  await store.ensure(db);
  const row = await store.read(db, input.run?.id);
  const forecast = forecastOf(row);
  if (!forecast) return { status: 'unavailable', reason: 'prior_forecast_missing' };
  const run = await db.get('SELECT id,agent_id,status FROM strategy_execution_runs WHERE id=?', input.run.id);
  if (run?.agent_id !== forecast.agentId || !TERMINAL.has(run.status)) return { status: 'refused', reason: 'terminal_run_required' };
  const evidence = resolutionEvidence(input.event);
  const resolution = { event: input.event, outcome: Number(evidence?.success), observedAt: new Date().toISOString() };
  if (!validResolution(forecast, resolution)) return { status: 'refused', reason: 'independent_bound_resolution_required' };
  if (row.resolution_json) {
    trialOf(row);
    const previous = JSON.parse(row.resolution_json);
    if (digest(previous.event) !== digest(resolution.event)) reject('Conflicting resolution.');
    return { status: 'resolved', replayed: true };
  }
  await store.resolve(db, { runId: forecast.runId, resolution, hash: digest(resolution) });
  const saved = await store.read(db, forecast.runId);
  if (saved.resolution_hash !== digest(resolution)) reject('Concurrent resolution conflict.');
  return { status: 'resolved', replayed: false };
}

function trialOf(row) {
  const forecast = forecastOf(row);
  if (!row.resolution_json) return null;
  const resolution = JSON.parse(row.resolution_json);
  if (digest(resolution) !== row.resolution_hash || !validResolution(forecast, resolution)) reject('Resolution integrity or authority mismatch.');
  return { runId: forecast.runId, probability: forecast.probability, outcome: resolution.outcome,
    forecastHash: row.forecast_hash, resolutionHash: row.resolution_hash };
}

async function readTrials(db, agentId) {
  await store.ensure(db);
  const binding = await store.scope(db, agentId);
  if (!binding) return { trials: [], forecasts: 0, unresolved: 0, invalid: 0 };
  const rows = await store.list(db, binding);
  const result = { trials: [], forecasts: rows.length, unresolved: 0, invalid: 0 };
  for (const row of rows) {
    try {
      const trial = trialOf(row);
      if (trial) result.trials.push(trial);
      else result.unresolved += 1;
    } catch (_) { result.invalid += 1; }
  }
  return result;
}

module.exports = { SCHEMA, capture, captureSafe, observe, readTrials };
