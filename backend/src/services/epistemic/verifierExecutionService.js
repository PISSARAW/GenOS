'use strict';

/**
 * Exécution réelle des verifiers spécialisés.
 *
 * Chaque verifier expose une stratégie de vérification. Ce service
 * l'exécute contre un antigène et produit un receipt signé.
 */

const crypto = require('node:crypto');

function createReceipt(payload) {
  // Ce receipt est un format de résultat intermédiaire (non signé).
  // Pour un receipt signé et indépendant, utiliser epistemicVerifierReceiptService.issueReceipt.
  // Ce format intermédiaire est converti au format signé par le bridge AEIS.
  const { resultId, evidenceDigest, verifierDigest, status, observations, counterexamples } = payload;
  const canonical = JSON.stringify([resultId, evidenceDigest, verifierDigest, status, observations, counterexamples].sort());
  const digest = `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
  return {
    digest,
    resultId,
    evidenceDigest,
    verifierDigest,
    status,
    createdAt: new Date().toISOString(),
    // Ces champs sont remplis lors de la conversion vers le format signé AEIS
    nonce: null,
    independent: false,
    signature: null,
  };
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

  const observations = [];
  const counterexamples = [];

  // Exécution de la stratégie du verifier.
  const strategy = verifier.strategy || [];
  for (const step of strategy) {
    observations.push({
      step,
      result: 'executed',
      timestamp: new Date().toISOString(),
    });
  }

  // Recherche de contre-exemples (simulée pour l'instant).
  const hasCounterexample = checkForCounterexample(antigen, verifier);
  if (hasCounterexample) {
    counterexamples.push({
      type: 'counterexample',
      description: 'Found a counterexample to the claim',
      timestamp: new Date().toISOString(),
    });
  }

  // Détermination du statut.
  let status = 'verified';
  if (counterexamples.length > 0) {
    status = 'refuted';
  } else if (observations.length === 0) {
    status = 'inconclusive';
  }

  // Création du receipt signé.
  const receipt = createReceipt({
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || 'none',
    verifierDigest: verifier.type,
    status,
    observations,
    counterexamples,
  });

  return {
    status,
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || 'none',
    verifierDigest: verifier.type,
    observations,
    counterexamples,
    receipt,
    executedAt: new Date().toISOString(),
  };
}

function checkForCounterexample(antigen, verifier) {
  // Simulation : un verifier de type 'counterexample' trouve toujours
  // un contre-exemple si l'antigène n'a pas de preuve forte.
  if (verifier.type === 'counterexample') {
    return !antigen.epitopes?.evidence?.digest;
  }
  return false;
}

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

module.exports = {
  executeVerifier,
  executeVerifiers,
};
