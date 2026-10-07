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
    workspaceId: verifier.executionWorkspace || runtimeWorkspaceId(verifier, worker, actorId),
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
  if (!verifier.executionWorkspace) {
    return { independent: false, distance: 0, reason: 'missing_execution_workspace', descriptor };
  }
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
  preReceipt.executionEvidence = signed.outcome.observations.filter((item) => item.detail?.executionId).map((item) => item.detail);
  // Le verifier couvre l'obligation correspondant au claim qu'il valide.
  preReceipt.coveredObligations = [antigen.id];
  const signedReceipt = issueReceipt(preReceipt);
  return {
    status: signed.outcome.status,
    verifierType: verifier.type,
    resultId: antigen.id,
    verifierId: verifier.id || null,
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
    verifierDigest: verifier.verifierDigest || null,
    error: err.message,
    observations: [],
    counterexamples: [],
  };
}

async function runSingleVerifier(antigen, verifier, ctx) {
  resolveVerifierDigest(verifier);
  const worker = buildVerifierWorker(antigen, verifier);
  const enriched = enrichVerifier(antigen, verifier);
  const outcome = await executeVerifierWithAdapter(
    antigen,
    enriched,
    { worker, timeoutMs: ctx.opts.timeoutMs || 30000, testConfig: enriched.test,
      artifactConfig: enriched.artifact, allowedWorkspaceRoot: ctx.opts.allowedWorkspaceRoot,
      db: ctx.opts.db, nativeOracleSubject: ctx.opts.nativeOracleSubject }
  );
  const executionWorkspace = outcome.observations?.find((item) => item.detail?.executionId)?.detail.cwd;
  const executed = verifier.type === 'procedure_semantic'
    ? require('./oracleProcedureAdapter').executedVerifier(verifier, outcome) : { ...verifier, executionWorkspace };
  const independence = executionWorkspace
    ? evaluateVerifierIndependence(executed, antigen, ctx.executedVerifiers)
    : { independent: false, distance: 0, reason: 'missing_execution_workspace', descriptor: buildVerifierDescriptor(executed, antigen, worker) };
  return { result: signVerifierResult(antigen, executed, { outcome, independence }), executed };
}

function consumeVerifierBudget(budget) {
  if (!budget) return true;
  if (!Number.isInteger(budget.remaining) || budget.remaining <= 0) return false;
  budget.remaining -= 1;
  return true;
}

function setFallbackContract(enriched, command) {
  const artifactTypes = ['artifact', 'proof', 'repro', 'benchmark'];
  if (artifactTypes.includes(enriched.type)) {
    enriched.artifact = { buildCommand: command };
  } else {
    enriched.test = { command };
  }
}

function enrichVerifier(antigen, verifier) {
  // Injecter le contrat de vérification complet (test + artifact) pour que
  // l'adapter puisse réellement exécuter via sandbox avec expectOutput.
  const enriched = { ...verifier };
  const contract = antigen.verificationContract;
  if (contract?.test) {
    enriched.test = { ...contract.test, ...(contract.test.replicas?.[verifier.type] ?? {}) };
  } else if (contract?.artifact) {
    enriched.artifact = contract.artifact;
  } else if (antigen.reproCommand && !enriched.test && !enriched.artifact) {
    setFallbackContract(enriched, antigen.reproCommand);
  }
  return enriched;
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
  const executedVerifiers = [...(opts.priorVerifiers || [])];

  for (const verifier of verifiers) {
    if (!consumeVerifierBudget(opts.verifierBudget)) {
      results.push({ status: 'inconclusive', verifierType: verifier.type, reason: 'verifier_budget_exhausted' });
      continue;
    }
    try {
      const executed = await runSingleVerifier(antigen, verifier, { executedVerifiers, opts });
      results.push(executed.result);
      executedVerifiers.push(executed.executed);
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
