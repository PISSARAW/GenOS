'use strict';

const { digest } = require('../trinityProvenanceValues');

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

function text(value, maximum = 2048) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maximum;
}

function list(value, check, maximum = 100) {
  return Array.isArray(value) && value.length > 0 && value.length <= maximum && value.every(check);
}

function methodInput(method, methodId) {
  if (method?.version !== 1 || method.methodId !== methodId) {
    throw error('WORKER_METHOD_CONTRACT_INVALID', `Expected version 1 method '${methodId}'.`);
  }
  const input = method.parameters;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw error('WORKER_PROCEDURE_INPUT_INVALID', 'Structured parameters are required.');
  }
  return input;
}

function receipt(method, output) {
  const inputDigest = digest(method);
  const receiptDigest = digest({ inputDigest, output });
  return { id: `solver://sha256:${receiptDigest}`, methodId: method.methodId,
    inputDigest: `sha256:${inputDigest}`, result: output };
}

function resultReport(method, output, artifact) {
  const executionReceipt = receipt(method, output);
  const refs = [...new Set([executionReceipt.id, ...(artifact.sourceRefs || [])])];
  const claims = [{ statement: artifact.statement, evidence: refs }];
  const content = artifact.type === 'dossier' ? { claims, ...output } : output;
  return { methodId: method.methodId, output, receipt: executionReceipt, evidenceReport: {
    outcome: 'success', claims, workerArtifact: { type: artifact.type, content,
      provenance: { sourceRefs: refs } }
  } };
}

module.exports = { error, text, list, methodInput, receipt, resultReport };
