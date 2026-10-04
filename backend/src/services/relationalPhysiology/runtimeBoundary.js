'use strict';

const { evaluate, digest } = require('./index');

const PORTS = ['withBoundary', 'loadContext', 'authorize', 'recordDecision', 'execute', 'now'];
function assertPorts(ports) {
  for (const name of PORTS) {
    if (typeof ports?.[name] !== 'function') throw new Error(`RPE_MISSING_PORT:${name}`);
  }
}
function executionPlan(request, decision) {
  if (request.kind !== 'communicate') return { ...request };
  // Do not pass the original body/refs to the transport: the allowlist is causal.
  return {
    kind: request.kind, operationId: request.operationId, actorId: request.actorId,
    scope: request.scope, receiverId: decision.plan.receiverId,
    refs: decision.plan.refs, event: decision.plan.event,
    requiredAck: decision.plan.requiredAck
  };
}

// withBoundary must fence policy/revocation updates THROUGH dispatch admission,
// deduplicate operation IDs, and atomically reserve resources. It is a trusted
// host port, not a lock implemented here. No port means no execution.
async function runGuarded(request, ports) {
  assertPorts(ports);
  return ports.withBoundary(request.operationId, async () => {
    const timed = { ...request, at: ports.now() };
    const context = await ports.loadContext(timed.scope);
    const authorization = await ports.authorize(timed, context);
    const decision = evaluate({ context, request: timed, authorization });
    await ports.recordDecision(decision);
    if (!decision.permitted) return { status: 'denied', decision };
    if (decision.plan.disposition === 'silence') return { status: 'silent', decision };
    const plan = executionPlan(timed, decision);
    const result = await ports.execute({ plan, decision, planHash: digest(plan) });
    return { status: 'executed', decision, result };
  });
}

module.exports = { runGuarded, executionPlan };
