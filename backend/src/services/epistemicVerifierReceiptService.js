'use strict';

/**
 * epistemicVerifierReceiptService.js
 *
 * Service de signature des receipts de vérification épistémique.
 *
 * Le receipt est immuable après signature — toute modification est détectée
 * par validateReceipt() qui recalcule l'HMAC.
 *
 * Le receipt contient l'indépendance calculée par independencePolicy,
 * incluse dans la signature pour garantir l'intégrité.
 */

const crypto = require('node:crypto');
const { currentKeyId, keyFor } = require('./epistemicReceiptKeyring');

function payloadText(receipt) {
  const fields = [
    receipt.resultId,
    receipt.evidenceDigest,
    receipt.verifierDigest,
    receipt.checkedAt,
    receipt.nonce,
    receipt.status,
    receipt.independent === true ? 'independent' : 'dependent',
    receipt.independenceDescriptor ? JSON.stringify(receipt.independenceDescriptor) : '',
    receipt.independenceDistance !== undefined ? String(receipt.independenceDistance) : '',
  ];
  if (Array.isArray(receipt.coveredObligations)) {
    fields.push([...receipt.coveredObligations].sort().join(','));
  }
  if (Array.isArray(receipt.evidenceTypes)) {
    fields.push([...receipt.evidenceTypes].sort().join(','));
  }
  if (receipt.executionEvidence) fields.push(JSON.stringify(receipt.executionEvidence));
  if (receipt.keyId) fields.push(receipt.keyId);
  return fields.join('\u0000');
}

function signatureFor(receipt) {
  return crypto.createHmac('sha256', keyFor(receipt.keyId)).update(payloadText(receipt)).digest('hex');
}

function issueReceipt(input = {}) {
  const receipt = {
    resultId: input.resultId,
    evidenceDigest: input.evidenceDigest,
    verifierDigest: input.verifierDigest,
    checkedAt: input.checkedAt || new Date().toISOString(),
    nonce: input.nonce || crypto.randomUUID(),
    status: input.status || 'verified',
    independent: input.independent === true,
    keyId: currentKeyId(),
    independenceDescriptor: input.independenceDescriptor || null,
    independenceDistance: input.independenceDistance !== undefined ? input.independenceDistance : null,
  };
  if (Array.isArray(input.coveredObligations)) {
    receipt.coveredObligations = [...input.coveredObligations];
  }
  if (Array.isArray(input.evidenceTypes)) {
    receipt.evidenceTypes = [...new Set(input.evidenceTypes)].sort();
  }
  if (Array.isArray(input.executionEvidence)) receipt.executionEvidence = input.executionEvidence;
  return { ...receipt, signature: signatureFor(receipt) };
}

function safeSignature(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) return null;
  return Buffer.from(value, 'hex');
}

function validateReceipt(receipt, trustedVerifierDigests = []) {
  if (!receipt || !trustedVerifierDigests.includes(receipt.verifierDigest)) return false;
  if (Number.isNaN(Date.parse(receipt.checkedAt)) || !receipt.nonce) return false;
  let expected;
  try {
    expected = Buffer.from(signatureFor(receipt), 'hex');
  } catch (_) {
    return false;
  }
  const received = safeSignature(receipt.signature);
  if (!received || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

module.exports = { issueReceipt, validateReceipt, signatureFor };
