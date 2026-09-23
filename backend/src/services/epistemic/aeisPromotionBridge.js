'use strict';

/**
 * Pont AEIS → Promotion.
 *
 * Convertit les résultats du Holobionte épistémique en assemblée
 * d'assurance épistémique compatible avec epistemicAssurancePolicy.
 *
 * Corrections :
 * - Utilise l'adaptateur Holobionte→FormalResult (pas de mapping implicite).
 * - Ne produit plus 'pending' (status invalide pour FormalResult).
 * - Ne modifie plus les receipts après signature.
 * - L'indépendance est portée par le receipt signé, pas ajoutée après coup.
 */

const crypto = require('node:crypto');
const { evaluateEpistemicAssurance } = require('../epistemicAssuranceService');
const { adaptImmuneResult } = require('./formalResultAdapter');
const { createFormalResult } = require('../formalResultService');

/**
 * Convertit un résultat immunitaire Holobionte en FormalResult.
 * Utilise l'adaptateur explicite.
 */
function holobionteToFormalResult(antigen, holobionteResult) {
  const immune = holobionteResult.immune || holobionteResult;
  const { candidate, error } = adaptImmuneResult(immune, antigen);
  if (error) return null;
  try {
    return createFormalResult(candidate);
  } catch (_) {
    return null;
  }
}

function actorFromReceipt(receipt) {
  if (receipt.independenceDescriptor && receipt.independenceDescriptor.actorId) {
    return receipt.independenceDescriptor.actorId;
  }
  return receipt.actorId || receipt.verifierDigest || 'unknown';
}

function buildConstraintAttestations(verifications, obligationIds) {
  const sorted = [...obligationIds].sort();
  const seen = new Set();
  const attestations = [];
  for (const receipt of verifications) {
    if (receipt.independent !== true) continue;
    const actorId = actorFromReceipt(receipt);
    if (seen.has(actorId)) continue;
    seen.add(actorId);
    attestations.push({ actorId, obligationIds: sorted, independent: true });
  }
  return attestations;
}

function candidateAssumptions(antigen) {
  const raw = antigen.epitopes?.assumptions || [];
  return raw.map((item, i) => {
    if (typeof item === 'string') return { id: `assumption-${i}`, statement: item };
    return { id: item.id || `assumption-${i}`, statement: item.statement || String(item) };
  });
}

function candidateValidityDomain(antigen, statement) {
  const raw = antigen.epitopes?.validityDomain || {};
  return {
    statement: raw.statement || raw.domain || statement,
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
  };
}

function candidateFromAntigen(antigen) {
  const statement = typeof antigen.claim === 'string' ? antigen.claim : '(claim)';
  return {
    canonicalStatement: statement,
    status: 'tested',
    evidence: {
      kind: 'reproducible_artifact',
      content: { claim: statement, antigenId: antigen.id },
      reproduction: { command: 'holobionte:review', environment: 'genos' },
    },
    assumptions: candidateAssumptions(antigen),
    validityDomain: candidateValidityDomain(antigen, statement),
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'holobionte',
      source: {
        type: 'holobionte',
        uri: 'genos://holobionte',
        digest: stableIdFor(statement),
      },
      inputs: [],
      transformations: ['claim-to-formal'],
    },
    producer: antigen.producer || { model: 'worker', version: '1.0' },
  };
}

function bindAntigenToFormalResult(antigen) {
  try {
    const formalResult = createFormalResult(candidateFromAntigen(antigen));
    antigen.id = formalResult.resultId;
    antigen.epitopes.evidence = {
      ...antigen.epitopes.evidence,
      kind: formalResult.evidence.kind,
      digest: formalResult.evidence.digest,
    };
    antigen.formalResult = formalResult;
    return formalResult;
  } catch (_) {
    return null;
  }
}

function resolveFormalResult(antigen, holobionteResult) {
  if (antigen.formalResult) return antigen.formalResult;
  return holobionteToFormalResult(antigen, holobionteResult);
}

/**
 * Construit une assemblée d'assurance à partir des résultats Holobionte.
 * Les verifications sont extraites des receipts EXISTANTS sans les modifier.
 * Les FormalResults pré-créés (bindés avant vérification) sont réutilisés
 * pour garantir receipt.resultId === result.resultId.
 */
function buildAssuranceAssemblyFromHolobionte(antigens, holobionteResults, context = {}) {
  const results = antigens
    .map((antigen, i) => resolveFormalResult(antigen, holobionteResults[i]))
    .filter(Boolean);

  const verifiedResults = results.filter(r => r.status === 'verified' || r.status === 'tested');
  const verifications = extractSignedVerifications(holobionteResults);
  const obligationIds = results.map(r => r.resultId);

  return {
    results,
    verifications,
    obligations: results.map(r => ({ id: r.resultId, required: true, description: `Validation of claim: ${r.canonicalStatement}` })),
    coverage: results.map(r => ({ resultId: r.resultId, obligationId: r.resultId, evidenceDigest: r.evidence.digest })),
    constraintAttestations: buildConstraintAttestations(verifications, obligationIds),
    equivalences: [],
    relations: [],
    contradictionResolutions: [],
    compositionRoots: verifiedResults.map(r => r.resultId),
    failureReuses: [],
    contributions: [],
    workerIds: context.workerIds || [],
    trustedVerifierDigests: context.trustedVerifierDigests || [],
  };
}

function extractSignedVerifications(holobionteResults) {
  const verifications = [];
  for (const hr of holobionteResults) {
    const vr = hr?.immune?.verifierResults?.results;
    if (!Array.isArray(vr)) continue;
    for (const v of vr) {
      if (v.receipt?.signature) verifications.push(v.receipt);
    }
  }
  return verifications;
}

async function evaluateAeisForPromotion(antigens, context = {}) {
  const { epistemicHolobionte } = require('./epistemicHolobionteService');

  for (const antigen of antigens) bindAntigenToFormalResult(antigen);

  const holobionteResults = await Promise.all(
    antigens.map(antigen => epistemicHolobionte(antigen, {
      ...context,
      immuneMemory: context.immuneMemory || [],
      domain: context.domain,
      stakes: context.stakes,
    }))
  );

  const assembly = buildAssuranceAssemblyFromHolobionte(antigens, holobionteResults, context);
  const evaluation = evaluateEpistemicAssurance(assembly);

  return {
    evaluation,
    assembly,
    holobionteResults,
    allAccepted: holobionteResults.every(r => r.accepted),
    anyBlocked: holobionteResults.some(r => r.immune?.blocked && !r.immune?.regulatorInhibited),
  };
}

function statementFromClaim(claim) {
  return claim.statement || claim.claim || String(claim);
}

function stableIdFor(statement, existingId) {
  if (existingId) return existingId;
  return `sha256:${crypto.createHash('sha256').update(`antigen:${statement}`).digest('hex')}`;
}

function claimToAntigen(claim, domain = 'general') {
  const statement = statementFromClaim(claim);
  return {
    id: claim.id || stableIdFor(statement),
    claim: statement,
    epitopes: {
      evidence: claim.evidence?.[0] || { kind: 'reproducible_artifact' },
      assumptions: claim.assumptions || [],
      validityDomain: claim.validityDomain || { domain },
      dependencies: claim.dependencies || [],
      provenance: claim.provenance || null,
    },
    producer: claim.producer || { model: 'worker', version: '1.0' },
    risk: claim.risk || { score: 0.5 },
  };
}

function extractAntigensFromReport(report, domain = 'general') {
  if (!report || !Array.isArray(report.claims)) return [];
  return report.claims
    .filter(c => c && (c.statement || c.claim))
    .map(c => claimToAntigen(c, domain));
}

async function evaluateReportWithAeis(report, context = {}) {
  const antigens = extractAntigensFromReport(report, context.domain);
  if (antigens.length === 0) {
    return {
      evaluation: { eligible: true, violations: [], assemblyDigest: '', resultIds: [] },
      assembly: null,
      holobionteResults: [],
      allAccepted: true,
      anyBlocked: false,
    };
  }
  return evaluateAeisForPromotion(antigens, context);
}

module.exports = {
  holobionteToFormalResult,
  buildAssuranceAssemblyFromHolobionte,
  buildConstraintAttestations,
  bindAntigenToFormalResult,
  evaluateAeisForPromotion,
  claimToAntigen,
  extractAntigensFromReport,
  evaluateReportWithAeis,
};
