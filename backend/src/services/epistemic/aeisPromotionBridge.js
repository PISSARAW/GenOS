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

/**
 * Construit une assemblée d'assurance à partir des résultats Holobionte.
 * Les verifications sont extraites des receipts EXISTANTS sans les modifier.
 */
function buildAssuranceAssemblyFromHolobionte(antigens, holobionteResults, context = {}) {
  const results = antigens
    .map((antigen, i) => holobionteToFormalResult(antigen, holobionteResults[i]))
    .filter(Boolean);

  const verifiedResults = results.filter(r => r.status === 'verified' || r.status === 'tested');

  return {
    results,
    verifications: extractSignedVerifications(holobionteResults),
    obligations: results.map(r => ({ id: r.resultId, required: true, description: `Validation of claim: ${r.canonicalStatement}` })),
    coverage: results.map(r => ({ resultId: r.resultId, obligationId: r.resultId, evidenceDigest: r.evidence.digest })),
    constraintAttestations: [],
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

function claimToAntigen(claim, domain = 'general') {
  return {
    claim: claim.statement || claim.claim || String(claim),
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
  evaluateAeisForPromotion,
  claimToAntigen,
  extractAntigensFromReport,
  evaluateReportWithAeis,
};
