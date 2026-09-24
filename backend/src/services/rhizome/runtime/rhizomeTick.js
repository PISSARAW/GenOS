'use strict';

const rhizome = require('../../rhizomeCoordinationService');
const actionPlanner = require('./rhizomeActionPlanner');
const actionExecutor = require('./rhizomeActionExecutor');

async function tick(input) {
  const options = input.options || {};
  const snapshot = await rhizome.graphSnapshot(input.sessionId, options);
  const route = await rhizome.routeToCapability(input.sessionId, input.need, options);
  const action = actionPlanner.plan(route, input.need);
  if (action.type === 'EXECUTE_ROUTE') return runRoute({ input, options, snapshot, route, action });
  return inspectGap({ input, options, snapshot, route, action });
}

async function runRoute(context) {
  const { input, options, snapshot, route, action } = context;
  const execution = await actionExecutor.execute({
    route, need: input.need, execute: input.execute, verify: input.verify
  });
  if (execution.status !== 'VERIFIED') return { status: execution.status, snapshot, route, action, execution };
  const outcome = await rhizome.recordRouteOutcome(input.sessionId, execution.receipt, {
    ...options, trustedVerifierDigests: input.trustedVerifierDigests
  });
  return { status: `ROUTE_${execution.receipt.outcome}`, snapshot, route, action, execution, outcome };
}

async function inspectGap(context) {
  const { input, options, snapshot, route, action } = context;
  const gap = await rhizome.inspectCapabilityNeed(input.sessionId, input.need, options);
  if (!gap.gap) return { status: 'NO_ROUTE_OR_GAP', snapshot, route, action, gap };
  if (!Array.isArray(input.candidates)) return { status: 'GAP_OPEN', snapshot, route, action, gap };
  const growth = await rhizome.planGrowth(input.sessionId, gap.gap.gapId, {
    ...options, candidates: input.candidates, threshold: input.growthThreshold
  });
  if (!growth.permitted) return { status: 'GAP_OPEN', snapshot, route, action, gap, growth };
  const executeGrowth = input.services?.executeGrowth;
  if (typeof executeGrowth !== 'function') return { status: 'GROWTH_PROPOSED', snapshot, route, action, gap, growth };
  const execution = await executeGrowth({ sessionId: input.sessionId, need: input.need, gap: gap.gap, growth, options });
  return { status: execution.status, snapshot, route, action, gap, growth, execution };
}

module.exports = { tick };
