'use strict';

const STAGES = Object.freeze(['OBSERVE', 'DIAGNOSE', 'PLAN', 'EXECUTE', 'VERIFY', 'RECORD']);
const REQUIRED_ADAPTERS = Object.freeze(['observe', 'diagnose', 'plan', 'execute', 'verify']);

async function runRegionalRuntime(input = {}, options = {}) {
  requireRuntimeContext(input, options);
  const limit = cycleLimit(input.maxCycles);
  const cycles = [];
  for (let index = 0; index < limit; index += 1) {
    const stopped = stopReason(input.stopConditions, index);
    if (stopped) return { status: 'STOPPED', reason: stopped, cycles };
    const result = await runRegionalCycle({ ...input, cycle: index + 1 }, options);
    cycles.push(result);
    if (result.status !== 'VERIFIED') return { status: 'HALTED', reason: result.reason || result.status, cycles };
  }
  return { status: 'LIMIT_REACHED', reason: 'MAX_CYCLES', cycles };
}

async function runRegionalCycle(input = {}, options = {}) {
  requireRuntimeContext(input, options);
  const missing = missingAdapters(options.adapters);
  if (missing.length) return { status: 'BLOCKED', reason: 'ADAPTERS_MISSING', missingAdapters: missing, stages: STAGES };
  const stop = stopReason(input.stopConditions, Number(input.cycle || 0) - 1);
  if (stop) return { status: 'STOPPED', reason: stop, stages: STAGES };
  try {
    return await executeCycleStages(input, options);
  } catch (error) {
    return recordCycleFailure(input, options, error);
  }
}

async function executeCycleStages(input, options) {
  const adapter = options.adapters;
  const observed = await adapter.observe(input);
  const diagnosis = await adapter.diagnose(observed, input);
  const plan = await adapter.plan(diagnosis, observed, input);
  validatePlan(plan);
  const execution = await executePlan(adapter, { plan, diagnosis, observed, input });
  const verification = await adapter.verify(execution, plan, diagnosis, observed, input);
  if (!verification || verification.valid !== true) throw runtimeError('REGIONAL_VERIFY_FAILED', 'Regional cycle verification failed.');
  await recordCycle(input, options, { type: 'REGIONAL_CYCLE_RECORDED', diagnosis, plan, execution, verification });
  return { status: 'VERIFIED', cycle: input.cycle || null, stages: STAGES,
    actionCount: plan.actions.length, verification };
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
  const coordination = require('../metapopulationCoordinationService');
  return coordination.recordMetapopulationEvent(input.metapopulationId, {
    type: outcome.type,
    payload: { cycle: input.cycle || null, status: outcome.type === 'REGIONAL_CYCLE_RECORDED' ? 'VERIFIED' : 'FAILED',
      actionCount: outcome.plan?.actions?.length || 0, diagnosis: outcome.diagnosis?.summary || null,
      verification: outcome.verification?.valid === true ? 'VALID' : null, failure: outcome.failure || null },
    actor: input.actor || 'metapopulation-runtime',
    provenance: { source: 'regionalRuntimeService', stages: STAGES },
    occurredAt: new Date().toISOString()
  }, { db: options.db, actor: input.actor });
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

module.exports = { runRegionalRuntime, runRegionalCycle, STAGES };
