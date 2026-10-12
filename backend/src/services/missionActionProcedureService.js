'use strict';

const crypto = require('node:crypto');
const procedures = require('./proceduralCompilationService');

const bindings = new Map();

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function registerBinding(id, binding) {
  if (typeof id !== 'string' || !id.trim()
      || typeof binding?.execute !== 'function'
      || typeof binding?.validateResult !== 'function') {
    throw new TypeError('A trusted procedure executor and result validator are required.');
  }
  bindings.set(id, binding);
}

function validDefinition(execution) {
  return execution?.version === 1
    && ['procedureId', 'contextHash', 'contextSignature', 'receiptDigest', 'executorId']
      .every((field) => typeof execution[field] === 'string' && Boolean(execution[field]))
    && Object.hasOwn(execution, 'input');
}

function definitionReason(action) {
  const execution = action.execution;
  if (!validDefinition(execution)) return 'procedure_definition_incomplete';
  if (procedures.contextSignature(execution.context || {}) !== execution.contextSignature) {
    return 'procedure_context_mismatch';
  }
  if (!bindings.has(execution.executorId)) return 'procedure_executor_missing';
  return null;
}

function obligationMatch(procedure, action, contract) {
  const expected = [...new Set(action.covers || [])].sort();
  const actual = [...new Set(procedure.obligationIds || [])].sort();
  const allowed = new Set(contract.obligations.map((item) => item.id));
  return expected.length > 0 && expected.every((id) => allowed.has(id))
    && JSON.stringify(expected) === JSON.stringify(actual)
    && procedure.outcomeContractDigest === digest(contract);
}

function receiptEvidenceMatch(receipt, action) {
  const promoted = new Set(receipt.evidenceRefs || []);
  return (action.requiredEvidenceRefs || []).every((ref) => promoted.has(ref));
}

function inspectionInput(action, request, contract) {
  const execution = action.execution;
  return { agentId: request.agentId, procedureId: execution.procedureId,
    contextHash: execution.contextHash, context: execution.context || {},
    input: execution.input, validateReceipt: async (receipt, procedure) =>
      receipt.digest === execution.receiptDigest
      && receiptEvidenceMatch(receipt, action)
      && procedure.version === execution.version
      && procedure.contextHash === execution.contextHash
      && procedure.contextSignature === execution.contextSignature
      && procedure.executorId === execution.executorId
      && obligationMatch(procedure, action, contract) };
}

async function inspect(context) {
  const { db, action, request, contract } = context;
  const reason = definitionReason(action);
  if (reason) return { status: 'blocked', reason };
  const input = inspectionInput(action, request, contract);
  const result = await procedures.inspect(db, input);
  return result.status === 'ready' ? { ...result, input } : result;
}

async function execute(context) {
  const { action, db, request, contract } = context;
  const ready = await inspect(context);
  if (ready.status !== 'ready') {
    throw Object.assign(new Error(`Procedure is unavailable: ${ready.reason}`),
      { code: 'MISSION_PROCEDURE_UNAVAILABLE', reason: ready.reason });
  }
  const binding = bindings.get(action.execution.executorId);
  const result = await procedures.reuse(db, { ...ready.input,
    executor: binding.execute,
    validateResult: (value, procedure) => binding.validateResult(value,
      { procedure, action, request, contract }) });
  if (result.status !== 'reused') {
    throw Object.assign(new Error(`Procedure failed closed: ${result.reason}`),
      { code: 'MISSION_PROCEDURE_FAILED', reason: result.reason });
  }
  return { success: true, value: result.value, llmCalls: 0,
    inputTokens: 0, outputTokens: 0, costUsd: 0,
    procedure: { id: result.procedure.procedureId, version: result.procedure.version,
      contextHash: result.procedure.contextHash, receiptDigest: result.promotionReceipt.digest,
      obligationIds: result.procedure.obligationIds },
    resultVerified: true, missionVerified: false };
}

module.exports = { registerBinding, inspect, execute };
