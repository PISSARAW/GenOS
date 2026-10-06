'use strict';

const STAGES = Object.freeze(['OBSERVE', 'DIAGNOSE', 'PLAN', 'EXECUTE', 'VERIFY', 'RECORD']);
const REQUIRED_ADAPTERS = Object.freeze(['observe', 'diagnose', 'plan', 'execute', 'verify']);

async function runRegionalRuntime(input = {}, options = {}) {
  requireRuntimeContext(input, options);
  const limit = cycleLimit(input.maxCycles);
  const cycles = [];
  const lastVerified = await getLastVerifiedCycle(options.db, input.metapopulationId);
  const startCycle = lastVerified ? lastVerified.cycle + 1 : 1;
  input = { ...input };
  if (input.resume === true && lastVerified) input.seed = lastVerified.seed;

  for (let offset = 0; offset < limit; offset += 1) {
    const index = startCycle - 1 + offset;
    const stopped = await persistedStopReason(input, options, offset);
    if (stopped) return { status: 'STOPPED', reason: stopped, cycles };
    const result = await runRegionalCycle({ ...input, cycle: index + 1 }, options);
    cycles.push(result);
    if (result.status === 'NO_ACTION') return { status: 'NO_ACTION', reason: 'NO_ACTIONS_PLANNED', cycles };
    if (result.status !== 'VERIFIED') return { status: 'HALTED', reason: result.reason || result.status, cycles };
  }
  return { status: 'LIMIT_REACHED', reason: 'MAX_CYCLES', cycles };
}

async function runRegionalCycle(input = {}, options = {}) {
  requireRuntimeContext(input, options);
  const missing = missingAdapters(options.adapters);
  if (missing.length) return { status: 'BLOCKED', reason: 'ADAPTERS_MISSING', missingAdapters: missing, stages: STAGES };
  const stop = await persistedStopReason(input, options, 0);
  if (stop) return { status: 'STOPPED', reason: stop, stages: STAGES };
  try {
    return await executeCycleStages(input, options);
  } catch (error) {
    return recordCycleFailure(input, options, error);
  }
}

async function executeCycleStages(input, options) {
  const adapter = options.adapters;
  const seed = input.seed || generateSeed();
  input = { ...input, seed };
  const observed = await adapter.observe(input);
  const diagnosis = await adapter.diagnose(observed, input);
  const plan = await adapter.plan(diagnosis, observed, input);
  validatePlan(plan);
  const stopped = await persistedStopReason(input, options, 0);
  if (stopped) return { status: 'STOPPED', reason: stopped, cycle: input.cycle, stages: STAGES };
  const execution = await executePlan(adapter, { plan, diagnosis, observed, input });
  const verification = await adapter.verify(execution, plan, diagnosis, observed, input);
  if (!verification || verification.valid !== true) throw runtimeError('REGIONAL_VERIFY_FAILED', 'Regional cycle verification failed.');
  const status = plan.actions.length === 0 ? 'NO_ACTION' : 'VERIFIED';
  const { withTransaction } = require('../../../db');
  await withTransaction(options.db, async () => {
    await recordCycle(input, options, { type: 'REGIONAL_CYCLE_RECORDED', status, diagnosis, plan, execution, verification, seed });
    if (status === 'VERIFIED') await persistCycleState(input, options, { observed, diagnosis, plan, execution, verification, seed });
  });
  return { status, cycle: input.cycle || null, stages: STAGES,
    actionCount: plan.actions.length, verification, seed };
}

async function persistCycleState(input, options, cycleData) {
  const { db } = options;
  const metapopulationId = input.metapopulationId;
  const stateId = require('crypto').randomUUID();
  const { withTransaction } = require('../../../db');
  await withTransaction(db, async () => {
    await db.run(
      `INSERT INTO metapopulation_cycle_states
       (state_id, metapopulation_id, cycle, seed, observed_json, diagnosis_json, plan_json, execution_json, verification_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?)`,
      stateId, metapopulationId, input.cycle, cycleData.seed,
      JSON.stringify(cycleData.observed), JSON.stringify(cycleData.diagnosis),
      JSON.stringify(cycleData.plan), JSON.stringify(cycleData.execution),
      JSON.stringify(cycleData.verification), new Date().toISOString()
    );
  });
}

async function getLastVerifiedCycle(db, metapopulationId) {
  const row = await db.get(
    `SELECT cycle, seed, observed_json, diagnosis_json, plan_json, execution_json, verification_json
     FROM metapopulation_cycle_states
     WHERE metapopulation_id = ? AND status = 'VERIFIED'
     ORDER BY cycle DESC LIMIT 1`,
    metapopulationId
  );
  if (!row) return null;
  return {
    cycle: row.cycle,
    seed: row.seed,
    observed: JSON.parse(row.observed_json),
    diagnosis: JSON.parse(row.diagnosis_json),
    plan: JSON.parse(row.plan_json),
    execution: JSON.parse(row.execution_json),
    verification: JSON.parse(row.verification_json)
  };
}

async function resumeFromCycle(db, metapopulationId, targetCycle) {
  const row = await db.get(
    `SELECT cycle, seed, observed_json, diagnosis_json, plan_json, execution_json, verification_json
     FROM metapopulation_cycle_states
     WHERE metapopulation_id = ? AND cycle = ? AND status = 'VERIFIED'`,
    metapopulationId, targetCycle
  );
  if (!row) return null;
  return {
    cycle: row.cycle,
    seed: row.seed,
    observed: JSON.parse(row.observed_json),
    diagnosis: JSON.parse(row.diagnosis_json),
    plan: JSON.parse(row.plan_json),
    execution: JSON.parse(row.execution_json),
    verification: JSON.parse(row.verification_json)
  };
}

async function executePlan(adapter, context) {
  const { plan, diagnosis, observed, input } = context;
  if (plan.actions.length === 0) return { completed: true, noOp: true, actionCount: 0 };
  const result = await adapter.execute(plan, diagnosis, observed, input);
  if (!result || result.completed !== true) throw runtimeError('REGIONAL_EXECUTION_INCOMPLETE', 'Regional actions did not complete.');
  return result;
}

async function recordCycleFailure(input, options, error) {
  const failure = { code: error.code || 'REGIONAL_CYCLE_FAILED', message: error.message };
  try { await recordCycle(input, options, { type: 'REGIONAL_CYCLE_FAILED', failure }); }
  catch (recordError) { return { status: 'RECORD_FAILED', reason: recordError.code || recordError.message, failure, stages: STAGES }; }
  return { status: 'FAILED', reason: failure.code, failure, stages: STAGES };
}

async function recordCycle(input, options, outcome) {
  const coordination = require('../../metapopulationCoordinationService');
  return coordination.recordMetapopulationEvent(input.metapopulationId, {
    type: outcome.type,
    payload: { cycle: input.cycle || null, status: outcome.status || (outcome.type === 'REGIONAL_CYCLE_RECORDED' ? 'VERIFIED' : 'FAILED'),
      actionCount: outcome.plan?.actions?.length || 0, diagnosis: outcome.diagnosis?.summary || null,
      verification: outcome.verification?.valid === true ? 'VALID' : null, failure: outcome.failure || null },
    actor: input.actor || 'metapopulation-runtime',
    provenance: { source: 'regionalRuntimeService', stages: STAGES },
    occurredAt: new Date().toISOString()
  }, { db: options.db, actor: input.actor });
}

async function persistedStopReason(input, options, cycleIndex) {
  const supplied = stopReason(input.stopConditions, cycleIndex);
  if (supplied) return supplied;
  if (input.signal?.aborted) return 'STOP_REQUESTED';
  const session = await options.db.get('SELECT status FROM metapopulation_sessions WHERE id = ?', input.metapopulationId);
  if (!session) throw runtimeError('METAPOPULATION_SESSION_UNKNOWN', 'Unknown metapopulation session.');
  return stopReason({ sessionStatus: session.status });
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.actions)) throw runtimeError('REGIONAL_PLAN_INVALID', 'Plan must contain an actions array.');
}

function missingAdapters(adapters = {}) { return REQUIRED_ADAPTERS.filter((name) => typeof adapters[name] !== 'function'); }
function requireRuntimeContext(input, options) {
  if (!options.db || !input.metapopulationId) throw runtimeError('METAPOPULATION_CONTEXT_REQUIRED', 'Persistent regional runtime requires a database and session.');
}
function stopReason(conditions = {}, cycleIndex = 0) {
  if (conditions.requested === true) return 'STOP_REQUESTED';
  if (conditions.sessionStatus === 'CLOSED' || conditions.sessionStatus === 'QUIESCENT') return 'SESSION_INACTIVE';
  if (Number.isFinite(conditions.remainingBudget) && conditions.remainingBudget <= 0) return 'BUDGET_EXHAUSTED';
  if (Number.isFinite(conditions.maxCycles) && cycleIndex >= conditions.maxCycles) return 'MAX_CYCLES';
  return null;
}
function cycleLimit(value) { return Number.isSafeInteger(value) ? Math.max(1, Math.min(100, value)) : 1; }
function runtimeError(code, message) { return Object.assign(new Error(message), { code }); }
function generateSeed() { return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`; }

module.exports = { runRegionalRuntime, runRegionalCycle, STAGES, persistCycleState, getLastVerifiedCycle, resumeFromCycle };
