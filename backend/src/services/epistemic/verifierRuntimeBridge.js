'use strict';

/**
 * Pont entre les verifiers AEIS et le runtime worker GenOS.
 *
 * Les verifiers assignés par le Holobionte sont exécutés comme des workers
 * isolés via `workerEvidenceBarrierPipeline`. Chaque worker reçoit :
 * - l'antigène épistémique
 * - la stratégie du verifier
 * - un budget d'exécution
 *
 * Les résultats sont retournés au Holobionte pour décision finale.
 */

const { executeVerifier } = require('./verifierExecutionService');

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

/**
 * Exécute un batch de verifiers comme des workers isolés.
 * Chaque worker est exécuté via `executeVerifier` (pas de véritable
 * isolation processuelle, mais isolation logique via le receipt signé).
 */
async function executeVerifierWorkers(antigen, verifiers, opts = {}) {
  if (!verifiers || !verifiers.length) {
    return { status: 'no_verifier', results: [] };
  }

  const results = [];
  for (const verifier of verifiers) {
    try {
      const worker = buildVerifierWorker(antigen, verifier);
      const result = executeVerifier(antigen, verifier, {
        worker,
        timeoutMs: opts.timeoutMs || 30000,
      });
      results.push(result);
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
};
