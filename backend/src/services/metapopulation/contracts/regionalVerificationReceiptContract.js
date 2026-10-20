'use strict';

const { digest } = require('../../evidenceContractService');

const SCHEMA = 'genos.metapopulation-cycle-verification/v1';

function text(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function verificationMaterial(verification = {}) {
  const { receipt, ...material } = verification;
  return material;
}

function receiptBody(input = {}) {
  return { schema: SCHEMA, missionId: input.missionId,
    metapopulationId: input.metapopulationId, cycle: input.cycle,
    verdict: 'VERIFIED', producerId: input.producerId,
    verifierId: input.verifierId, independent: true,
    resultHash: digest(input.execution),
    verificationHash: digest(verificationMaterial(input.verification)) };
}

function issue(input = {}) {
  const producerId = text(input.producerId);
  const verifierId = text(input.verification?.verifierId);
  const cycle = Number(input.cycle);
  if (!text(input.missionId) || !text(input.metapopulationId)
      || !Number.isSafeInteger(cycle) || cycle < 1) return null;
  if (!producerId || !verifierId || input.verification?.independent !== true) return null;
  if (producerId === verifierId) return null;
  const body = receiptBody({ ...input, producerId, verifierId });
  return { ...body, receiptHash: digest(body) };
}

function validScope(input) {
  const receipt = input.receipt;
  return receipt.schema === SCHEMA && receipt.missionId === input.missionId
    && receipt.metapopulationId === input.metapopulationId
    && Number(receipt.cycle) === Number(input.cycle);
}

function validIndependence(receipt) {
  return Boolean(text(receipt.producerId) && text(receipt.verifierId)
    && receipt.independent === true && receipt.producerId !== receipt.verifierId);
}

function validBinding(input) {
  const body = { ...input.receipt };
  delete body.receiptHash;
  return input.receipt.verdict === 'VERIFIED'
    && input.receipt.resultHash === input.expected.resultHash
    && input.receipt.verificationHash === input.expected.verificationHash
    && input.receipt.receiptHash === digest(body);
}

function validate(input = {}) {
  const receipt = input.receipt;
  if (!receipt) return { valid: false, missing: true };
  const expected = receiptBody({ ...input, producerId: receipt.producerId,
    verifierId: receipt.verifierId });
  return { valid: validScope(input) && validIndependence(receipt)
    && validBinding({ receipt, expected }), missing: false };
}

module.exports = { SCHEMA, issue, validate, verificationMaterial };
