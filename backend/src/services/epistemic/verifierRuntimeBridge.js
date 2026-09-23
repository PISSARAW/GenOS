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
const { resolveVerifierDigest } = require('../verifierTrustRegistry');

function buildVerifierWorker(antigen, verifier) {
  const agentId = `verifier-${verifier.type}-${verifier.id || 'anon'}`;
  return {
    agentId,
    workspaceId: verifier.workspaceId || `ws-${agentId}`,
    executionId: `${agentId}-${Date.now()}`,
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

function pick(value, fallback) {
  if (value !== undefined && value !== null && value !== '') return value;
  return fallback;
}

function runtimeActorId(verifier, worker) {
  const fallback = `verifier-${verifier.type}-${verifier.id || 'anon'}`;
  const fromVerifier = pick(verifier.actorId, pick(verifier.agentId, null));
  if (fromVerifier) return fromVerifier;
  if (worker && worker.agentId) return worker.agentId;
  return fallback;
}

function runtimeWorkspaceId(verifier, worker, actorId) {
  if (verifier.workspaceId) return verifier.workspaceId;
  if (worker && worker.workspaceId) return worker.workspaceId;
  return `ws-${actorId}`;
}

function buildVerifierDescriptor(verifier, antigen, worker) {
  const actorId = runtimeActorId(verifier, worker);
  const strategy = (verifier.strategy || []).join(',');
  return {
    actorId,
    model: pick(pick(verifier.model, verifier.provider), verifier.type),
    version: pick(verifier.version, '1.0'),
    strategy: pick(strategy, verifier.type),
    evidenceSource: pick(antigen.id, 'unknown'),
    workspaceId: runtimeWorkspaceId(verifier, worker, actorId),
    executionId: pick(pick(verifier.executionId, worker && worker.agentId), null),
    contextDigest: pick(verifier.contextDigest, null),
    toolchainDigest: pick(verifier.toolchainDigest, null),
  };
}

function producerActorId(producer) {
  const fromProducer = pick(producer.actorId, pick(producer.agentId, null));
  if (fromProducer) return fromProducer;
  return `producer-${pick(producer.model, 'worker')}`;
}

function buildProducerDescriptor(antigen) {
  const producer = antigen.producer || {};
  const actorId = producerActorId(producer);
  return {
    actorId,
    model: pick(pick(producer.model, producer.name), 'worker'),
    version: pick(producer.version, '1.0'),
    strategy: pick(producer.strategy, 'solve'),
    evidenceSource: pick(antigen.id, 'unknown'),
    workspaceId: pick(pick(producer.workspaceId, antigen.workspaceId), `ws-${actorId}`),
  };
}

/**
 * Évalue l'indépendance d'un verifier par rapport au PRODUCTEUR
 * puis par rapport aux verifiers précédents.
 * Le premier verifier n'est plus automatiquement indépendant :
 * il doit être indépendant du producer du claim.
 */
function evaluateVerifierIndependence(verifier, antigen, priorVerifiers) {
  const worker = buildVerifierWorker(antigen, verifier);
  const descriptor = buildVerifierDescriptor(verifier, antigen, worker);
  const producerDescriptor = buildProducerDescriptor(antigen || {});
  const vsProducer = evaluateIndependence(descriptor, [producerDescriptor]);
  if (!vsProducer.independent) return vsProducer;
  const priorDescriptors = priorVerifiers.map((v) => buildVerifierDescriptor(v, antigen));
  return evaluateIndependence(descriptor, priorDescriptors);
}

function summarizeResults(results) {
  const verified = results.filter((r) => r.status === 'verified').length;
  const refuted = results.filter((r) => r.status === 'refuted').length;
  const inconclusive = results.filter((r) => r.status === 'inconclusive').length;
  const errors = results.filter((r) => r.status === 'error').length;
  return { verified, refuted, inconclusive, errors };
}

function aggregateStatus(summary) {
  if (summary.refuted > 0) return 'refuted';
  if (summary.verified > 0) return 'verified';
  return 'inconclusive';
}

function signVerifierResult(antigen, verifier, signed) {
  const verifierDigest = resolveVerifierDigest(verifier);
  const preReceipt = buildPreReceipt({
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest,
    verifierDigest,
    status: signed.outcome.status,
    observations: signed.outcome.observations,
    counterexamples: signed.outcome.counterexamples,
  });
  preReceipt.independent = signed.independence.independent;
  preReceipt.independenceDescriptor = signed.independence.descriptor;
  preReceipt.independenceDistance = signed.independence.distance;
  // Le verifier couvre l'obligation correspondant au claim qu'il valide.
  preReceipt.coveredObligations = [antigen.id];
  const signedReceipt = issueReceipt(preReceipt);
  return {
    status: signed.outcome.status,
    resultId: antigen.id,
    evidenceDigest: antigen.epitopes?.evidence?.digest || signedReceipt.evidenceDigest || 'none',
    verifierDigest,
    observations: signed.outcome.observations,
    counterexamples: signed.outcome.counterexamples,
    receipt: signedReceipt,
    executedAt: new Date().toISOString(),
  };
}

function errorVerifierResult(verifier, err) {
  return {
    status: 'error',
    verifierDigest: resolveVerifierDigest(verifier),
    error: err.message,
    observations: [],
    counterexamples: [],
  };
}

async function runSingleVerifier(antigen, verifier, ctx) {
  const worker = buildVerifierWorker(antigen, verifier);
  // Injecter le contrat de vérification complet (test + artifact) pour que
  // l'adapter puisse réellement exécuter via sandbox avec expectOutput.
  const enriched = { ...verifier };
  const contract = antigen.verificationContract;
  if (contract?.test) {
    enriched.test = contract.test;
  } else if (contract?.artifact) {
    enriched.artifact = contract.artifact;
  } else if (antigen.reproCommand && !enriched.test && !enriched.artifact) {
    // Fallback : reconstruire depuis reproCommand seul.
    const looksLikeArtifact = enriched.type === 'artifact' || enriched.type === 'proof' || enriched.type === 'repro' || enriched.type === 'benchmark';
    if (looksLikeArtifact) {
      enriched.artifact = { buildCommand: antigen.reproCommand };
    } else {
      enriched.test = { command: antigen.reproCommand };
    }
  }
  const outcome = await executeVerifierWithAdapter(
    antigen,
    enriched,
    { worker, timeoutMs: ctx.opts.timeoutMs || 30000, testConfig: enriched.test, artifactConfig: enriched.artifact }
  );
  const independence = evaluateVerifierIndependence(verifier, antigen, ctx.executedVerifiers);
  return signVerifierResult(antigen, verifier, { outcome, independence });
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
      results.push(await runSingleVerifier(antigen, verifier, { executedVerifiers, opts }));
      executedVerifiers.push(verifier);
    } catch (err) {
      results.push(errorVerifierResult(verifier, err));
    }
  }

  const summary = summarizeResults(results);
  return { status: aggregateStatus(summary), results, summary };
}

module.exports = {
  buildVerifierWorker,
  buildVerifierPrompt,
  buildVerifierDescriptor,
  buildProducerDescriptor,
  executeVerifierWorkers,
  evaluateVerifierIndependence,
};
