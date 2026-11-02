'use strict';

const { createRuntime } = require('../cognitiveOmegaRuntimeService');
const { immutable } = require('../evidenceProtocol/conversation');
const { digest } = require('../evidenceProtocol/canonical');
const { runKey } = require('./executionStore');
const effectValidation = require('./effectValidation');

const REGISTERS = { READ: 'registerReader', SELECT: 'registerSelector', CHECK: 'registerVerifier',
  INFER: 'registerInferer', CALL: 'registerTool', EMIT: 'registerEmitter' };

class RuntimeAdapter {
  constructor(options) {
    this.store = options.store;
    this.handlers = options.handlers;
    this.effectGate = options.effectGate;
  }

  effectRequest(execution, operation, argumentsValue) {
    const plan = execution.accepted.plan;
    const request = execution.accepted.program.payload.requests[operation.id];
    const candidate = operation.kind === 'EMIT' ? argumentsValue.value : argumentsValue.input;
    return { effectKey: effectValidation.effectKey({ scope: execution.message.scope, missionId: execution.message.missionId,
      conversationId: execution.message.conversationId, runId: execution.binding.runId,
      planDigest: execution.binding.planDigest, stepId: operation.id }),
    scope: execution.message.scope, missionId: execution.message.missionId, conversationId: execution.message.conversationId,
    runId: execution.binding.runId, planId: plan.planId, planDigest: execution.binding.planDigest,
    programDigest: plan.programDigest, capabilitiesDigest: plan.capabilitiesDigest, policyDigest: plan.policyDigest,
    baseDigest: plan.baseDigest, environmentDigest: plan.environmentDigest, runtimeId: plan.runtimeId,
    runtimeGeneration: plan.runtimeGeneration, stepId: operation.id, kind: operation.kind, reference: operation.reference,
    generations: execution.accepted.context.generations, actor: execution.accepted.context.sender,
    authority: execution.accepted.context.authority, budget: plan.budget,
    resourceId: request.resourceId, action: request.action, cost: request.cost, candidate, candidateDigest: digest(candidate),
    proofReceipt: operation.kind === 'EMIT' ? argumentsValue.receipt : null,
    expiresAt: execution.accepted.context.expiresAt };
  }

  async effect(execution, operation, argumentsValue) {
    if (typeof this.effectGate?.effect !== 'function') throw new Error('OMEGA effect gate missing.');
    const request = this.effectRequest(execution, operation, argumentsValue);
    const previous = this.store.effect(execution.binding, operation.id);
    if (previous && digest(previous.request) !== digest(request)) throw new Error('OMEGA effect request changed during recovery.');
    this.store.saveEffect(execution.binding, { stepId: operation.id, request });
    const receipt = await this.effectGate.effect(immutable(previous ? previous.request : request));
    if (receipt?.status !== 'completed') throw new Error('EFFECT_OUTCOME_UNKNOWN');
    if (!effectValidation.validReceipt(receipt, request)) throw new Error('OMEGA effect receipt binding mismatch.');
    this.store.saveEffect(execution.binding, { stepId: operation.id, request, receipt });
    return receipt.result;
  }

  async invoke(execution, operation, argumentsValue) {
    await execution.guard();
    let result;
    if (['CALL', 'EMIT'].includes(operation.kind)) result = await this.effect(execution, operation, argumentsValue);
    else {
      const installed = this.handlers.find((item) => item.kind === operation.kind && item.reference === operation.reference);
      const input = { request: execution.accepted.program.payload.requests[operation.id],
        context: { scope: execution.message.scope, missionId: execution.message.missionId,
          runId: execution.binding.runId, plan: execution.accepted.plan },
        input: argumentsValue.input ?? null, candidate: argumentsValue.candidate ?? null };
      result = await installed.handle(immutable(input));
    }
    await execution.guard();
    return result;
  }

  async execute(execution) {
    const runtime = createRuntime({ journal: this.store.journal });
    const policy = {};
    const operations = execution.accepted.program.operations.map((operation) => {
      const reference = `omega-protocol:${operation.kind}:${operation.id}`;
      const wrapper = (value) => this.invoke(execution, operation, value);
      const register = REGISTERS[operation.kind];
      if (['CALL', 'EMIT'].includes(operation.kind)) runtime[register](reference, wrapper, { idempotent: true });
      else runtime[register](reference, wrapper);
      const rule = operation.kind.toLowerCase();
      if (!policy[rule]) policy[rule] = [];
      policy[rule].push(reference);
      return { id: operation.id, kind: operation.kind, reference, dependsOn: operation.dependsOn, state: 'open' };
    });
    return runtime.execute({ runId: runKey(execution.binding), operations, policy, allowEmit: true,
      context: { scope: execution.message.scope, runKey: runKey(execution.binding), planDigest: execution.binding.planDigest } });
  }
}

module.exports = { RuntimeAdapter };
