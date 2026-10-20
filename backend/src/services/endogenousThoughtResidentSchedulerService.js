'use strict';

const loop = require('./endogenousThoughtLoopService');
const execution = require('./endogenousThoughtRunExecutionService');

const REQUIRED_FUNCTIONS = Object.freeze([
  'candidateProvider', 'authorize', 'verify'
]);

function unavailable(reason, missing = []) {
  return { status: 'unavailable', reason, missing };
}

function readiness(input = {}) {
  if (input.enabled !== true) return unavailable('disabled');
  const missing = REQUIRED_FUNCTIONS.filter((name) => typeof input[name] !== 'function');
  if (!input.worker) missing.push('worker');
  if (!execution.validSandbox(input.sandbox)) missing.push('sandbox');
  else if (typeof input.sandbox.recover !== 'function') missing.push('sandbox.recover');
  if (typeof input.usageMeter?.snapshot !== 'function') missing.push('usageMeter');
  if (missing.length) return unavailable('production-dependencies-missing', missing);
  return { status: 'ready', reason: null, missing: [] };
}

function maxCycles(input) {
  const value = Number(input.maxCycles ?? 1);
  return Number.isSafeInteger(value) && value >= 1 && value <= 10 ? value : 1;
}

function loopInput(candidate, input) {
  return { organizationId: candidate?.organizationId, projectId: candidate?.projectId,
    episodeId: candidate?.episodeId, maxCycles: maxCycles(input), authorize: input.authorize,
    verify: input.verify, worker: input.worker, sandbox: input.sandbox,
    usageMeter: input.usageMeter, questionGenerator: input.questionGenerator,
    grantedBy: input.grantedBy || 'ett-resident-scheduler', signal: input.signal,
    condition: input.condition, policies: input.policies };
}

async function runScheduled(db, input = {}) {
  const state = readiness(input);
  if (state.status !== 'ready') return state;
  const candidate = await input.candidateProvider(db);
  if (!candidate) return { status: 'idle', reason: 'no-candidate' };
  const result = await loop.runAutonomousLoop(db, loopInput(candidate, input));
  return { status: 'completed', reason: null, episodeId: result.episode?.episodeId
    || candidate.episodeId, loopStatus: result.status,
  cumulativeUsage: result.cumulativeUsage, usageSource: 'validated-run-receipts' };
}

module.exports = { readiness, runScheduled };
