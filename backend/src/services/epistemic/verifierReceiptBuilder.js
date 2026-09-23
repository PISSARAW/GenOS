'use strict';

/**
 * verifierReceiptBuilder.js
 *
 * Construit un "pre-receipt" intermédiaire à partir d'un résultat
 * de vérification, compatible avec le format attendu par
 * `epistemicVerifierReceiptService.issueReceipt()`.
 *
 * Ce n'est PAS un receipt signé. La signature est ajoutée côté
 * bridge (verifierRuntimeBridge) ou côté AEIS (epistemicAssurance)
 * par `issueReceipt()`.
 *
 * Format intermédiaire :
 *   { resultId, evidenceDigest, verifierDigest, status,
 *     observations, counterexamples, checkedAt, independent }
 *
 * Ce format est un sous-ensemble strict de ce qu'attend
 * `epistemicVerifierReceiptService.issueReceipt(input)`.
 */

const { computeEvidenceDigest: computeDigest } = require('./verifierAdapters');

function buildPreReceipt(result) {
  const observations = safeObservations(result);
  const counterexamples = safeCounterexamples(result);
  const evidenceDigest = resolveEvidenceDigest(result, observations);
  const payload = { observations, counterexamples };
  const baseReceipt = makeBasePreReceipt(result, evidenceDigest, payload);
  applyOptionalReceiptMetadata(baseReceipt, result);
  return baseReceipt;
}

function safeObservations(result) {
  return result?.observations || [];
}

function safeCounterexamples(result) {
  return result?.counterexamples || [];
}

function resolveEvidenceDigest(result, observations) {
  return result?.evidenceDigest ||
    result?.receipt?.evidenceDigest ||
    computeDigest(observations) ||
    'none';
}

function makeBasePreReceipt(result, evidenceDigest, payload) {
  return {
    resultId: result?.resultId || result?.id || 'unknown',
    evidenceDigest: evidenceDigest,
    verifierDigest: result?.verifierDigest || result?.verifierType || 'unknown',
    status: result?.status || 'inconclusive',
    observations: payload.observations,
    counterexamples: payload.counterexamples,
    checkedAt: new Date().toISOString(),
    // L'indépendance est déterminée par le bridge / AEIS,
    // pas par le résultat brut. Par défaut : false (dépendant).
    independent: false,
    // Les obligations couvertes par ce verifier (census indépendant).
    coveredObligations: result?.coveredObligations || null,
  };
}

function applyOptionalReceiptMetadata(preReceipt, result) {
  const source = result?.receipt;
  if (!source) return;
  if (source.checkedAt) preReceipt.checkedAt = source.checkedAt;
  if (source.nonce) preReceipt.nonce = source.nonce;
  if (source.independent !== undefined) preReceipt.independent = source.independent;
}

/**
 * Construit un pre-receipt à partir de paramètres individuels,
 * utile quand on n'a pas un objet `result` complet.
 */
function buildPreReceiptFromFields(fields) {
  const observations = fields.observations || [];
  const counterexamples = fields.counterexamples || [];

  return {
    resultId: fields.resultId || 'unknown',
    evidenceDigest: fields.evidenceDigest || computeDigest(observations) || 'none',
    verifierDigest: fields.verifierDigest || fields.verifierType || 'unknown',
    status: fields.status || 'inconclusive',
    observations,
    counterexamples,
    checkedAt: fields.checkedAt || new Date().toISOString(),
    independent: false,
  };
}

module.exports = {
  buildPreReceipt,
  buildPreReceiptFromFields,
};
