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

function secretKey() {
  const value = String(process.env.GENOS_EPISTEMIC_RECEIPT_SECRET || '').trim();
  if (!value) throw new Error('GENOS_EPISTEMIC_RECEIPT_SECRET must be configured.');
  return value;
}

function payloadText(receipt) {
  return [
    receipt.resultId,
    receipt.evidenceDigest,
    receipt.verifierDigest,
    receipt.checkedAt,
    receipt.nonce,
    receipt.status,
    receipt.independent === true ? 'independent' : 'dependent',
    receipt.independenceDescriptor ? JSON.stringify(receipt.independenceDescriptor) : '',
    receipt.independenceDistance !== undefined ? String(receipt.independenceDistance) : '',
  ].join('\u0000');
}

function signatureFor(receipt) {
  return crypto.createHmac('sha256', secretKey()).update(payloadText(receipt)).digest('hex');
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
    independenceDescriptor: input.independenceDescriptor || null,
    independenceDistance: input.indistanceDistance !== undefined ? input.indistanceDistance : null,
  };
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
