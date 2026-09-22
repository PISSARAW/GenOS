'use strict';

/**
 * Exécution réelle des verifiers spécialisés.
 *
 * Chaque verifier expose un type et une stratégie. Ce service
 * dispatche vers l'adapter correspondant (test, coverage, behavior,
 * artifact) qui produit de vraies observations, pas des stubs.
 *
 * Les receipts produits sont transmis à `epistemicVerifierReceiptService.issueReceipt()`
 * pour signature HMAC, afin d'unifier tous les receipts AEIS derrière un seul format
 * et une seule source de signature.
 */

const { executeVerifierWithAdapter, computeEvidenceDigest } = require('./verifierAdapters');
const { buildPreReceipt } = require('./verifierReceiptBuilder');
const { issueReceipt } = require('../epistemicVerifierReceiptService');

function mapVerifierTypeToAdapter(verifierType) {
  // Mapping entre les types de vérificateurs et les adapters correspondants
  const map = {
    testResult: 'test',
    test: 'test',
    coverage: 'coverage',
    behavior: 'behavior',
    counterexample: 'behavior',
    artifact: 'artifact',
    repro: 'artifact',
    replay: 'test',
  };
  return map[verifierType] || verifierType;
}

function executeVerifier(antigen, verifier, context = {}) {
  if (!antigen || !verifier) {
    return {
      status: 'inconclusive',
      reason: 'antigen or verifier missing',
      observations: [],
      counterexamples: [],
    };
  }

  // Mapping du type de verifier vers l'adapter correspondant
  const adapterType = mapVerifierTypeToAdapter(verifier.type);
  const mappedVerifier = { ...verifier, type: adapterType };

  // Exécution via l'adapter correspondant au type de verifier
  const adapterContext = { ...context, originalVerifierType: verifier.type };
  const { status, observations, counterexamples } = executeVerifierWithAdapter(
    antigen,
    mappedVerifier,
    adapterContext
  );

  // Construction du pre-receipt intermédiaire, puis signature via
  // epistemicVerifierReceiptService pour unifier tous les receipts AEIS.
  const preReceipt = buildPreReceipt({
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || computeEvidenceDigest(observations),
    verifierDigest: verifier.type,
    status,
    observations,
    counterexamples,
  });

  const signedReceipt = issueReceipt(preReceipt);

  return {
    status,
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || signedReceipt.evidenceDigest,
    verifierDigest: verifier.type,
    observations,
    counterexamples,
    receipt: signedReceipt,
    executedAt: new Date().toISOString(),
  };
}

function checkForCounterexample(antigen, verifier) {
  // Délégue à l'adapter de comportement si présent
  const { runBehaviorAdapter } = require('./verifierAdapters');
  const result = runBehaviorAdapter(antigen, verifier, {});
  return result?.counterexamples?.length > 0;
}

module.exports = {
  executeVerifier,
  executeVerifiers,
  checkForCounterexample,
};

function executeVerifiers(antigen, verifiers, context = {}) {
  if (!verifiers || !verifiers.length) {
    return { status: 'no_verifier', results: [] };
  }
  const results = verifiers.map((v) => executeVerifier(antigen, v, context));
  const verified = results.filter((r) => r.status === 'verified').length;
  const refuted = results.filter((r) => r.status === 'refuted').length;
  const inconclusive = results.filter((r) => r.status === 'inconclusive').length;

  return {
    status: refuted > 0 ? 'refuted' : (verified > 0 ? 'verified' : 'inconclusive'),
    results,
    summary: { verified, refuted, inconclusive },
  };
}
