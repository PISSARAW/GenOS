'use strict';

const persistence = require('../agowStatePersistenceService');
const pathwayRouter = require('../pathways/directPathwayRouter');
const plasticity = require('../plasticity/agowPlasticityCoordinator');

const RECEIPT_SCOPE = 'agow_decompilation_receipts';
const PREDICTION_ERROR_THRESHOLD = 0.5;

function reasons(input) {
  const causes = [];
  if (Math.abs(Number(input.predictionError) || 0) >= PREDICTION_ERROR_THRESHOLD) causes.push('prediction_error');
  if (input.environmentDrift === true) causes.push('environment_drift');
  if (input.unexpectedOutcome === true) causes.push('unexpected_outcome');
  if (input.contradiction === true) causes.push('contradiction');
  if (input.evidenceRequirementIncreased === true) causes.push('evidence_requirement_increased');
  if (input.safetyContextChanged === true) causes.push('safety_context_changed');
  return causes;
}

async function saveReceipt(input, result, causes) {
  const loaded = await persistence.load({ scope: RECEIPT_SCOPE, agentId: input.agentId, db: input.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  const receipt = { decompilationId: `decompile:${input.pathwayId}:${Date.now()}`,
    pathwayId: input.pathwayId, reasons: causes, predictionError: Number(input.predictionError) || 0,
    evidenceRefs: input.evidenceRefs || [], suspended: result.decompiled, candidateId: result.admission?.candidate?.candidateId || null,
    createdAt: Date.now() };
  receipts.push(receipt);
  await persistence.save({ scope: RECEIPT_SCOPE, agentId: input.agentId, db: loaded.db,
    state: { receipts: receipts.slice(-1000) }, version: receipts.length });
  return receipt;
}

async function recordOutcome(input) {
  const causes = reasons(input);
  const plasticityReceipt = await plasticity.recordOutcome({ agentId: input.agentId, db: input.db,
    pathwayId: input.pathwayId, contextHash: input.contextHash, success: input.success === true,
    evidenceRefs: input.evidenceRefs || [], evidenceStatus: input.evidenceStatus || 'reported',
    predictionError: input.predictionError || 0, reward: input.reward });
  if (!causes.length) return { decompiled: false, reason: 'prediction_within_tolerance', plasticity: plasticityReceipt };
  const result = await pathwayRouter.decompile({ ...input, reason: causes.join(','), predictionError: input.predictionError });
  const receipt = await saveReceipt(input, result, causes);
  return { ...result, causes, receipt, plasticity: plasticityReceipt };
}

async function list(options) {
  const loaded = await persistence.load({ scope: RECEIPT_SCOPE, agentId: options.agentId, db: options.db });
  return Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
}

module.exports = { recordOutcome, reasons, list, RECEIPT_SCOPE, PREDICTION_ERROR_THRESHOLD };
