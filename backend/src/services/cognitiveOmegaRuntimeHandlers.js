'use strict';

const proofBinding = require('./cognitiveOmegaProofBinding');

function blocked(reason, operation) {
  return { status: 'blocked', reason, operation: operation?.id || null };
}

function allowed(policy, kind, reference) {
  const rules = policy?.[kind.toLowerCase()];
  return rules === true || (Array.isArray(rules) && rules.includes(reference));
}

function verified(result) {
  return proofBinding.verified(result);
}

function operationInput(operation, values) {
  if (operation.input !== undefined) return operation.input;
  const dependencies = operation.dependsOn.map((id) => values[id]);
  return dependencies.length === 1 ? dependencies[0] : dependencies;
}

function semanticSelection(operation, values) {
  const selected = {};
  operation.dependsOn.forEach((id, index) => {
    const reference = operation.objectRefs?.[index];
    const field = reference?.split('/').pop();
    if (field && (!operation.selection.requiredFields?.length
      || operation.selection.requiredFields.includes(field))) selected[field] = values[id];
  });
  return selected;
}

async function read(operation, state, readers) {
    if (!allowed(state.policy, 'READ', operation.reference)) return blocked('read_not_authorized', operation);
    const reader = readers.get(operation.reference);
    let value;
    if (reader) value = await reader({ reference: operation.reference, context: state.context });
    else if (Object.hasOwn(state.objects, operation.reference)) value = state.objects[operation.reference];
    else if (operation.objectId && Object.hasOwn(state.objects, operation.objectId)) {
      value = state.objects[operation.objectId];
    }
    else if (state.mmu) {
      const page = await state.mmu.need({ objectId: operation.reference,
        sessionId: state.context.sessionId, scope: state.context.scope, context: state.context });
      if (!['ready', 'page_in'].includes(page.status) || page.page?.value === undefined) {
        return blocked(page.reason || 'page_in_failed', operation);
      }
      value = page.page.value;
    } else return blocked('reader_missing', operation);
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

async function select(operation, state, selectors) {
    if (!allowed(state.policy, 'SELECT', operation.reference || operation.id)) {
      return blocked('select_not_authorized', operation);
    }
    const selector = selectors.get(operation.reference || operation.id);
    const input = operationInput(operation, state.values);
    const selectedInput = !selector && operation.selection ? semanticSelection(operation, state.values) : input;
    const value = selector ? await selector({ input: selectedInput, context: state.context, values: state.values })
      : selectedInput;
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

async function call(operation, state, tools) {
    if (!allowed(state.policy, 'CALL', operation.reference)) return blocked('call_not_authorized', operation);
    const tool = tools.get(operation.reference);
    if (!tool) return blocked('tool_missing', operation);
    const input = operationInput(operation, state.values);
    const value = await tool({ arguments: operation.arguments ?? input, input, operation,
      context: state.context, values: state.values });
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

async function infer(operation, state, inferers) {
    if (!allowed(state.policy, 'INFER', operation.reference || operation.id)) {
      return blocked('infer_not_authorized', operation);
    }
    const inferer = inferers.get(operation.reference || operation.id);
    if (!inferer) return blocked('inferer_missing', operation);
    const value = await inferer({
      input: operationInput(operation, state.values),
      context: state.context,
      values: state.values,
      operation
    });
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

async function check(operation, state, verifiers) {
    if (!allowed(state.policy, 'CHECK', operation.reference)) return blocked('check_not_authorized', operation);
    const verifier = verifiers.get(operation.reference)
      || state.verifierRegistry?.get(operation.reference);
    if (!verifier) return blocked('verifier_missing', operation);
    const candidate = structuredClone(operationInput(operation, state.values));
    const candidateDigest = proofBinding.digest(candidate);
    const receipt = await verifier({ candidate: structuredClone(candidate),
      context: { ...state.context, resultId: operation.id, proof: operation.proof || null }, values: state.values });
    if (!verified(receipt)) return blocked('verification_failed', operation);
    state.receipts[operation.id] = receipt;
    state.proofDigests[operation.id] = candidateDigest;
    state.values[operation.id] = candidate;
    return { status: 'verified', receipt };
  }

async function emit(operation, state, emitters) {
    if (!state.allowEmit || !allowed(state.policy, 'EMIT', operation.reference)) {
      return blocked('emit_not_authorized', operation);
    }
    const proof = proofBinding.emission(operation, state);
    if (!proof) return blocked('emit_requires_verified_receipt', operation);
    const emitter = emitters.get(operation.reference);
    if (!emitter) return blocked('emitter_missing', operation);
    const value = await emitter({ ...proof,
      context: { ...state.context, effect: operation.effectContract || null } });
    state.values[operation.id] = value;
    return { status: 'emitted', value, receipt: proof.receipt };
  }

module.exports = { blocked, read, select, call, infer, check, emit };
