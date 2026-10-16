'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');
const transition = require('./morphogenesisTransitionReceipt');

function sha(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function observedAttempt(attempt) {
  return { id: attempt.id, taskId: attempt.taskId, seed: attempt.seed,
    taskFamily: attempt.taskFamily, modelId: attempt.modelId,
    workspaceId: attempt.workspaceId, startedAt: attempt.startedAt,
    budgetTokens: attempt.budgetTokens, latencyBudgetMs: attempt.latencyBudgetMs,
    toolPolicyHash: attempt.toolPolicyHash, quality: attempt.quality,
    tokens: attempt.tokens, latencyMs: attempt.latencyMs,
    completed: attempt.completed, transitionId: attempt.transitionId || null,
    workerResults: attempt.workerResults || [] };
}

function observedPrediction(prediction) {
  return { id: prediction.id, candidateId: prediction.candidateId,
    taskId: prediction.taskId, seed: prediction.seed,
    split: prediction.split, method: prediction.method, recordedAt: prediction.recordedAt,
    predictedGain: prediction.predictedGain, predictedCost: prediction.predictedCost };
}

function signedObservation(observation, receipt, digest) {
  return evidenceAudit.isVerifiedReceipt(receipt)
    && receipt.resultId === observation.id && receipt.evidenceDigest === digest;
}

function attemptIdentityValid(attempt) {
  return Boolean(attempt) && ['id', 'taskId', 'taskFamily', 'modelId',
    'workspaceId', 'toolPolicyHash'].every(key =>
    typeof attempt[key] === 'string' && attempt[key].trim().length > 0)
    && Number.isSafeInteger(attempt.seed)
    && Number.isFinite(Date.parse(attempt.startedAt));
}

function attemptMeasurementsValid(attempt) {
  const numbers = [attempt.quality, attempt.tokens, attempt.latencyMs,
    attempt.budgetTokens, attempt.latencyBudgetMs];
  return [numbers.every(Number.isFinite), attempt.quality >= 0, attempt.quality <= 1,
    attempt.tokens >= 0, attempt.tokens <= attempt.budgetTokens,
    attempt.latencyMs >= 0, attempt.latencyMs <= attempt.latencyBudgetMs,
    attempt.budgetTokens > 0, attempt.latencyBudgetMs > 0,
    attempt.completed === true].every(Boolean);
}

function validAttempt(attempt) {
  if (!attemptIdentityValid(attempt) || !attemptMeasurementsValid(attempt)) return false;
  const verifier = attempt.oracleReceipt?.independenceDescriptor;
  return verifier?.workspaceId !== attempt.workspaceId
    && Date.parse(attempt.oracleReceipt?.checkedAt) >= Date.parse(attempt.startedAt)
    && signedObservation(attempt, attempt.oracleReceipt, sha(observedAttempt(attempt)));
}

function sameExperiment(candidate, control) {
  return ['taskId', 'seed', 'taskFamily', 'modelId', 'budgetTokens',
    'latencyBudgetMs', 'toolPolicyHash'].every(key => candidate[key] === control[key])
    && candidate.id !== control.id && candidate.workspaceId !== control.workspaceId
    && control.transitionId == null;
}

function boundWorkerResults(candidate, receipt) {
  const bindings = receipt.identity.bindings || [];
  const results = candidate.workerResults || [];
  const expected = bindings.map(item => item.workerId).sort();
  const queued = [...(receipt.queuedWorkerIds || [])].sort();
  if (!bindings.length || results.length !== bindings.length
    || JSON.stringify(expected) !== JSON.stringify(queued)
    || new Set(results.map(item => item.agentId)).size !== results.length) return false;
  return results.every(item => item.status === 'completed'
    && transition.resultMatchesTransition(item, receipt));
}

function validTransition(candidate, receipt) {
  return transition.verifyTransitionReceipt(receipt) && receipt.dispatchStatus === 'queued'
    && candidate.transitionId === receipt.transitionId && boundWorkerResults(candidate, receipt);
}

function predictionFieldsValid(prediction, candidate, receipt) {
  if (!prediction) return false;
  return [typeof prediction.id === 'string', Boolean(prediction.id),
    typeof prediction.method === 'string', Boolean(prediction.method),
    prediction.candidateId === receipt.identity.candidateId,
    prediction.taskId === candidate.taskId, prediction.seed === candidate.seed,
    ['train', 'validation'].includes(prediction.split),
    Number.isFinite(prediction.predictedGain), prediction.predictedGain >= -1,
    prediction.predictedGain <= 1, Number.isFinite(prediction.predictedCost),
    prediction.predictedCost >= 0, prediction.predictedCost <= 1].every(Boolean);
}

function validPrediction(context) {
  const { prediction, candidate, control, receipt } = context;
  if (!predictionFieldsValid(prediction, candidate, receipt)) return false;
  const registered = Date.parse(prediction.recordedAt);
  return Number.isFinite(registered) && registered <= Date.parse(candidate.startedAt)
    && registered <= Date.parse(control.startedAt)
    && prediction.receipt?.checkedAt === prediction.recordedAt
    && signedObservation(prediction, prediction.receipt, sha(observedPrediction(prediction)));
}

function derivedMetrics(candidate, control) {
  const gain = candidate.quality - control.quality;
  const tokenOverhead = Math.max(0, candidate.tokens - control.tokens) / candidate.budgetTokens;
  const latencyOverhead = Math.max(0, candidate.latencyMs - control.latencyMs)
    / candidate.latencyBudgetMs;
  return { actualGain: Number(gain.toFixed(6)),
    actualCost: Number(Math.min(1, (tokenOverhead + latencyOverhead) / 2).toFixed(6)) };
}

function pairId(evidence) {
  const { candidate, control, transitionReceipt } = evidence;
  return sha({ taskId: candidate.taskId, seed: candidate.seed,
    candidateId: transitionReceipt.identity.candidateId,
    transitionId: transitionReceipt.transitionId,
    candidateAttemptId: candidate.id, controlAttemptId: control.id });
}

function validPairedEvidence(row) {
  const evidence = row?.pairEvidence;
  if (!evidence || row.scale !== 'COHORT_REPLACEMENT') return false;
  const { candidate, control, prediction, transitionReceipt } = evidence;
  if (!candidate || !control || !prediction || !transitionReceipt?.identity) return false;
  if (![validAttempt(candidate), validAttempt(control), sameExperiment(candidate, control),
    validTransition(candidate, transitionReceipt), validPrediction({ prediction, candidate,
      control, receipt: transitionReceipt })].every(Boolean)) return false;
  const metrics = derivedMetrics(candidate, control);
  return [row.id === pairId(evidence),
    row.candidateId === transitionReceipt.identity.candidateId,
    row.taskFamily === candidate.taskFamily, row.modelId === candidate.modelId,
    row.taskId === candidate.taskId, row.split === prediction.split,
    row.predictedGain === prediction.predictedGain,
    row.predictedCost === prediction.predictedCost,
    row.actualGain === metrics.actualGain, row.actualCost === metrics.actualCost].every(Boolean);
}

function validFinalReceipt(row) {
  const { candidate, control } = row.pairEvidence || {};
  const receipt = row.receipt;
  const workspace = receipt?.independenceDescriptor?.workspaceId;
  const checkedAt = Date.parse(receipt?.checkedAt);
  if (!candidate || !control || !workspace || !Number.isFinite(checkedAt)) return false;
  return workspace !== candidate.workspaceId && workspace !== control.workspaceId
    && checkedAt >= Date.parse(candidate.oracleReceipt?.checkedAt)
    && checkedAt >= Date.parse(control.oracleReceipt?.checkedAt);
}

module.exports = { observedAttempt, observedPrediction, derivedMetrics, pairId,
  validPairedEvidence, validFinalReceipt, sha };
