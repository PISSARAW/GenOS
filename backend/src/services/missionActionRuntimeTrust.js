'use strict';

const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function attestationPayload(input) {
  const action = input.action || {};
  const receipt = action.calibrationReceipt || {};
  return JSON.stringify(canonical({ schema: 'genos.mission-action-attestation/v1',
    runId: input.runId, missionId: input.missionId, contract: input.contract,
    action: { id: action.id, kind: action.kind, covers: action.covers,
      cost: action.cost, execution: action.execution,
      requiredEvidenceRefs: action.requiredEvidenceRefs },
    calibration: { probabilityVerified: receipt.probabilityVerified,
      evidenceRefs: receipt.evidenceRefs, validUntil: receipt.validUntil,
      issuer: receipt.issuer } }));
}

function validReceipt(receipt) {
  return typeof receipt?.signature === 'string'
    && /^sha256:[a-f0-9]{64}$/i.test(receipt.signature)
    && Number.isFinite(Date.parse(receipt.validUntil))
    && Date.parse(receipt.validUntil) > Date.now()
    && Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0
    && receipt.evidenceRefs.every((ref) => typeof ref === 'string' && Boolean(ref.trim()));
}

function attested(input, key) {
  const receipt = input.action?.calibrationReceipt;
  if (!key || Buffer.byteLength(key) < 32 || !validReceipt(receipt)) return false;
  const expected = crypto.createHmac('sha256', key).update(attestationPayload(input)).digest();
  const actual = Buffer.from(receipt.signature.slice(7), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function adaptersFor(input, key) {
  const valid = new Map(input.actions.filter((action) => attested({ ...input, action }, key))
    .map((action) => [action.id, action]));
  return {
    verifyAuthority: (action) => valid.has(action.id),
    verifyCalibration: (receipt, context) => {
      const action = valid.get(context.action.id);
      return Boolean(action && action.calibrationReceipt === receipt);
    },
    verifyEvidence: (ref) => [...valid.values()].some((action) =>
      action.calibrationReceipt.evidenceRefs.includes(ref)),
    verifyOutcome: () => false
  };
}

module.exports = { attestationPayload, attested, adaptersFor };
