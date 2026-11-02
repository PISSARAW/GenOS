'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { digest } = require('../evidenceProtocol/canonical');
const { OmegaAdmission } = require('../omegaProtocol/admission');
const { OmegaExecution } = require('../omegaProtocol/execution');
const interop = require('../cognitiveOmegaInteropService');
const bindingContext = require('./context');
const receipts = require('./store');
const program = require('./omegaProgram');
const messages = require('./omegaMessages');
const effects = require('./omegaEffects');

async function resolve(context) {
  if (!context?.executionRunId) return rejectDowngrade(context);
  if (!context.db) {
    if (context.missionId) throw bindingContext.failure('MISSION_OMEGA_BINDING_REQUIRED');
    return null;
  }
  const binding = await bindingContext.load(context.db, context.executionRunId);
  if (!binding && context.missionId) throw bindingContext.failure('MISSION_OMEGA_BINDING_REQUIRED');
  if (binding) assertIdentity(binding, context);
  return binding;
}

async function rejectDowngrade(context) {
  if (!context?.db || !context.missionId || !context.agentId) return null;
  const table = await context.db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_runs'");
  if (!table) return null;
  const active = await context.db.get(`SELECT p.run_id FROM mission_protocol_runs p
    JOIN strategy_execution_runs r ON r.id=p.run_id WHERE p.agent_id=? AND p.mission_id=?
    AND r.status IN ('planned','running','awaiting_approval') LIMIT 1`, context.agentId, context.missionId);
  if (active) throw bindingContext.failure('MISSION_OMEGA_RUN_ID_REQUIRED');
  return null;
}

function assertIdentity(binding, context) {
  if (context.agentId !== binding.agentId) throw bindingContext.failure('MISSION_OMEGA_ACTOR_OR_MISSION_MISMATCH');
  for (const field of ['agentId', 'missionId']) {
    if (context[field] && binding[field] !== context[field]) throw bindingContext.failure('MISSION_OMEGA_ACTOR_OR_MISSION_MISMATCH');
  }
  for (const field of ['organizationId', 'projectId']) {
    if (context[field] && binding.scope[field] !== context[field]) throw bindingContext.failure('MISSION_OMEGA_TENANT_MISMATCH');
  }
}

async function fresh(session) {
  assertIdentity(session.binding, session.input.context);
  await bindingContext.assertCurrent(session.binding);
  const current = { baseDigest: await program.base(session.input), environmentDigest: program.environment(session.input),
    generations: session.binding.generations };
  if (session.accepted && (current.baseDigest !== session.accepted.plan.baseDigest ||
    current.environmentDigest !== session.accepted.plan.environmentDigest)) throw new Error('MISSION_OMEGA_SOURCE_CHANGED');
  return current;
}

async function verifyPlan(session, request) {
  const current = await fresh(session);
  if (interop.digest(program.source(session.input)) !== request.plan.programDigest || request.plan.baseDigest !== current.baseDigest ||
    request.plan.environmentDigest !== current.environmentDigest || digest(request.capabilities) !== digest(session.capabilities)) {
    throw new Error('MISSION_OMEGA_SUBMISSION_NOT_CURRENT');
  }
  return { status: 'validated', requestDigest: digest(request),
    receiptDigest: digest({ nativeProgram: request.plan.programDigest, binding: session.binding.executionAuthorityRef }) };
}

async function admit(session) {
  const previous = session.admission.state(session.executionQuery);
  session.createdAt = previous?.descriptionMessage.createdAt || new Date().toISOString();
  const submit = previous?.submission || { planId: session.key, program: session.program,
    domain: session.input.graph.domain || 'runtime', policy: { policyId: 'mission-native-omega', version: '1' },
    baseDigest: await program.base(session.input), environmentDigest: program.environment(session.input), budget: session.budget,
    requirements: { verifierRefs: session.capabilities.verifierRefs, effectGuarantees: session.capabilities.effectGuarantees } };
  const describe = messages.message(session, 'DESCRIBE_RUNTIME', { runtimeId: session.capabilities.runtimeId });
  await session.admission.apply(describe); session.previous = describe.messageId;
  const submission = messages.message(session, 'SUBMIT_PROGRAM', { submission: submit });
  const planned = await session.admission.apply(submission); session.previous = submission.messageId;
  const accept = messages.message(session, 'ACCEPT_PLAN', { planId: planned.planId, planDigest: planned.planDigest });
  await session.admission.apply(accept); session.previous = accept.messageId;
  session.accepted = session.admission.acceptedPlan({ ...session.executionQuery, planId: planned.planId, planDigest: planned.planDigest });
  if (!session.accepted) throw new Error('MISSION_OMEGA_ACCEPTED_PLAN_UNAVAILABLE');
}

async function createSession(input, binding) {
  await bindingContext.assertCurrent(binding);
  input = { ...input, options: input.options || {}, binding };
  const nativeProgram = program.source(input);
  if (nativeProgram.operations.some(value => value.kind === 'EMIT') && input.options.cognitiveAllowEmit === false) {
    throw new Error('MISSION_OMEGA_EMIT_POLICY_DENIED');
  }
  if (nativeProgram.operations.some(value => value.kind === 'EMIT') && input.economy && input.economy.execution?.allowEmit !== true) {
    throw new Error('MISSION_OMEGA_EMIT_ECONOMY_DENIED');
  }
  const action = input.context.routeActionId || crypto.randomUUID();
  input.context.routeActionId = action;
  const key = digest([action, nativeProgram.id]).slice(7);
  const session = { binding, input, key, program: nativeProgram, closers: [],
    conversationId: `omega:${key}`, runId: `${binding.runId}:${action}` };
  try {
    session.executionQuery = { scope: binding.scope, missionId: binding.missionId, conversationId: session.conversationId, runId: session.runId };
    session.handlers = input.graph.operations.map(operation => program.handler(input, operation));
    session.capabilities = program.capabilities(input, session.handlers);
    session.assertFresh = () => fresh(session);
    session.budget = nativeProgram.operations.some(value => value.kind === 'EMIT') ? await effects.create(session)
      : { unit: 'operations', limit: 0, spent: 0, reserved: 0 };
    session.admission = new OmegaAdmission({ dbPath: path.join(binding.directory, `oa-${key.slice(0, 24)}.db`),
      authorize: frame => messages.authorize(session, frame), describeRuntime: async () => {
        await bindingContext.assertCurrent(binding); return program.capabilities(input, session.handlers);
      }, verifyPlan: request => verifyPlan(session, request) });
    session.closers.push(session.admission);
    await admit(session);
    session.execution = new OmegaExecution({ dbPath: path.join(binding.directory, `ox-${key.slice(0, 24)}.db`),
      authorize: frame => messages.authorize(session, frame), handlers: session.handlers, effectGate: session.effectGate,
      resolvePlan: query => session.admission.acceptedPlan(query),
      describeRuntime: async () => { await bindingContext.assertCurrent(binding); return program.capabilities(input, session.handlers); },
      currentContext: () => fresh(session) });
    session.closers.push(session.execution);
    return session;
  } catch (error) { session.closers.reverse().forEach(value => value.close()); throw error; }
}

function executionSummary(output) {
  const actual = output.runtimeResult;
  return { status: actual.status, digest: actual.digest || null, economy: actual.economy || null, mmu: actual.mmu || null,
    operations: (actual.results || []).map(({ id, kind, status, reason }) => ({ id, kind, status, reason })) };
}

async function execute(input, binding) {
  const session = await createSession(input, binding);
  try {
    await effects.reconcile(session);
    const previous = session.execution.state(session.executionQuery);
    const type = previous && !['completed', 'blocked'].includes(previous.status) ? 'RESUME' : 'EXECUTE';
    if (type === 'RESUME') session.messageSuffix = session.execution.history().length;
    const plan = session.accepted.plan;
    const frame = messages.message(session, type, { runId: session.runId, planId: plan.planId, planDigest: digest(plan),
      baseDigest: plan.baseDigest, environmentDigest: plan.environmentDigest });
    const output = await session.execution.apply(frame);
    await receipts.record(binding, { protocol: 'OMEGA', point: `${session.conversationId}:${frame.messageId}`, result: output });
    if (output.status !== 'completed') throw Object.assign(new Error(`Mission OMEGA execution blocked: ${output.status}`),
      { code: 'OMEGA_NATIVE_GRAPH_BLOCKED', omegaExecution: output });
    const operation = input.graph.operations.find(value => value.kind === 'INFER') || input.graph.operations.at(-1);
    return { result: output.runtimeResult.values[operation.id], execution: executionSummary(output),
      protocol: { name: 'OMEGA', runId: session.runId, planDigest: digest(plan) } };
  } finally { session.closers.reverse().forEach(value => value.close()); }
}

async function executeNativeGraph(input) {
  const binding = await resolve(input.context);
  return binding ? execute(input, binding) : null;
}

async function executeInference(input) {
  const binding = await resolve(input.context);
  if (!binding) return null;
  const reference = 'model/infer';
  const graph = { domain: 'runtime', id: 'mission-inference', objectStore: { prompt: input.context.prompt },
    operations: [{ id: 'prompt', kind: 'READ', reference: 'prompt', dependsOn: [] },
      { id: 'residual', kind: 'SELECT', reference: 'residual', dependsOn: ['prompt'] },
      { id: 'model_infer', kind: 'INFER', reference, dependsOn: ['residual'] }] };
  const route = async () => {
    const budget = await program.routeBudget({ ...input, binding });
    const context = { ...input.context, ...budget, db: binding.db, ...binding.scope, agentId: binding.agentId,
      executionRunId: binding.runId, missionId: binding.missionId };
    const runner = require('../modelRouteRunner');
    return input.mode === 'parallel' ? runner.runParallel(input.candidates, context) : runner.runFallback(input.candidates, context);
  };
  return execute({ ...input, graph, options: { cognitiveNativeHandlers: { inferers: { [reference]: route } } } }, binding);
}

module.exports = { resolve, executeNativeGraph, executeInference };
