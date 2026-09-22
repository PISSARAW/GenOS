'use strict';

/**
 * Pont entre les verifiers AEIS et le runtime worker GenOS.
 *
 * Les verifiers assignés par le Holobionte sont exécutés comme des workers
 * isolés via `executeVerifierWithAdapter`. Chaque worker reçoit :
 * - l'antigène épistémique
 * - la stratégie du verifier
 * - un budget d'exécution
 *
 * Corrections P0-P1 :
 * - independencePolicy évalue l'indépendance AVANT issueReceipt
 * - Le receipt signé porte l'indépendance calculée (immuable après signature)
 * - executeVerifierWithAdapter est async (await)
 */

const { executeVerifierWithAdapter } = require('./verifierAdapters');
const { buildPreReceipt } = require('./verifierReceiptBuilder');
const { issueReceipt } = require('../epistemicVerifierReceiptService');
const { evaluateIndependence } = require('../epistemicScheduler/independencePolicy');

function buildVerifierWorker(antigen, verifier) {
  return {
    agentId: `verifier-${verifier.type}-${verifier.id || 'anon'}`,
    label: verifier.type,
    prompt: buildVerifierPrompt(antigen, verifier),
    role: 'verifier',
    pipelineStage: 0,
    verifierStrategy: verifier.strategy || [],
    verifierType: verifier.type,
  };
}

function buildVerifierPrompt(antigen, verifier) {
  const claim = antigen.claim?.text || antigen.claim || '';
  const strategy = (verifier.strategy || []).join('\n- ');
  return [
    `VÉRIFICATEUR: ${verifier.type}`,
    `Antigène: ${antigen.id}`,
    `Claim: ${claim}`,
    `Stratégie:`,
    `- ${strategy}`,
    ``,
    `Exécutez chaque étape. Retournez un objet JSON {status, observations, counterexamples}.`,
  ].join('\n');
}

function buildVerifierDescriptor(verifier, antigen) {
  return {
    actorId: `verifier-${verifier.type}`,
    model: verifier.type,
    version: '1.0',
    strategy: (verifier.strategy || []).join(','),
    evidenceSource: antigen.id || 'unknown',
    workspaceId: `ws-verifier-${verifier.type}`,
  };
}

/**
 * Évalue l'indépendance d'un verifier par rapport aux verifiers précédents.
 * L'indépendance est déterminée AVANT la signature du receipt.
 */
function evaluateVerifierIndependence(verifier, antigen, priorVerifiers) {
  const descriptor = buildVerifierDescriptor(verifier, antigen);
  const priorDescriptors = priorVerifiers.map(v => buildVerifierDescriptor(v, antigen));
  return evaluateIndependence(descriptor, priorDescriptors);
}

/**
 * Exécute un batch de verifiers comme des workers isolés.
 * L'indépendance est calculée avant signature — le receipt est immuable.
 */
async function executeVerifierWorkers(antigen, verifiers, opts = {}) {
  if (!verifiers || !verifiers.length) {
    return { status: 'no_verifier', results: [] };
  }

  const results = [];
  const executedVerifiers = [];

  for (const verifier of verifiers) {
    try {
      const { status, observations, counterexamples } = await executeVerifierWithAdapter(
        antigen,
        verifier,
        { worker: buildVerifierWorker(antigen, verifier), timeoutMs: opts.timeoutMs || 30000 }
      );

      // Évalue l'indépendance AVANT de signer le receipt
      const independence = evaluateVerifierIndependence(verifier, antigen, executedVerifiers);

      const preReceipt = buildPreReceipt({
        resultId: antigen.id,
        evidenceDigest: antigen.epitopes?.evidence?.digest,
        verifierDigest: verifier.type,
        status,
        observations,
        counterexamples,
      });

      // L'indépendance calculée est incluse dans le pre-receipt signé
      preReceipt.independent = independence.independent;
      preReceipt.independenceDescriptor = independence.descriptor;
      preReceipt.independenceDistance = independence.distance;

      const signedReceipt = issueReceipt(preReceipt);

      executedVerifiers.push(verifier);

      results.push({
        status,
        resultId: antigen.id,
        evidenceDigest: antigen.epitopes?.evidence?.digest || signedReceipt.evidenceDigest || 'none',
        verifierDigest: verifier.type,
        observations,
        counterexamples,
        receipt: signedReceipt,
        executedAt: new Date().toISOString(),
      });
    } catch (err) {
      results.push({
        status: 'error',
        verifierDigest: verifier.type,
        error: err.message,
        observations: [],
        counterexamples: [],
      });
    }
  }

  const verified = results.filter((r) => r.status === 'verified').length;
  const refuted = results.filter((r) => r.status === 'refuted').length;
  const inconclusive = results.filter((r) => r.status === 'inconclusive').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return {
    status: refuted > 0 ? 'refuted' : (verified > 0 ? 'verified' : 'inconclusive'),
    results,
    summary: { verified, refuted, inconclusive, errors },
  };
}

module.exports = {
  buildVerifierWorker,
  buildVerifierPrompt,
  executeVerifierWorkers,
  evaluateVerifierIndependence,
};
