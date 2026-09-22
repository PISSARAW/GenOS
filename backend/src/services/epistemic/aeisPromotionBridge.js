'use strict';

/**
 * Pont AEIS → Promotion.
 *
 * Convertit les résultats du Holobionte épistémique en assemblée
 * d'assurance épistémique compatible avec epistemicAssurancePolicy.
 */

const { evaluateEpistemicAssurance } = require('../epistemicAssuranceService');
const { executeVerifiers } = require('./verifierExecutionService');
const { createFormalResult } = require('../formalResultService');
const crypto = require('node:crypto');

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function digest(value) {
  const text = JSON.stringify(canonicalValue(value));
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

function holobionteToFormalResult(antigen, holobionteResult) {
  const immune = holobionteResult.immune;
  const verifierResults = immune.verifierResults?.results || [];
  const verified = verifierResults.filter(r => r.status === 'verified').length > 0;
  const refuted = verifierResults.filter(r => r.status === 'refuted').length > 0;

  return {
    resultId: antigen.id || `result-${Date.now()}`,
    canonicalStatement: antigen.claim,
    type: 'FACTUAL',
    status: refuted ? 'refuted' : (verified ? 'verified' : 'pending'),
    evidence: {
      kind: antigen.epitopes?.evidence?.kind || 'observation',
      digest: antigen.epitopes?.evidence?.digest || digest(antigen),
      quality: refuted ? 0 : (verified ? 0.8 : 0.4),
    },
    assumptions: antigen.epitopes?.assumptions || [],
    validityDomain: antigen.epitopes?.validityDomain || { domain: 'general', coverage: 5, constraints: 5 },
    dependencies: antigen.epitopes?.dependencies || [],
    provenance: {
      sourceType: 'aeis_holobionte',
      sourceDocument: 'epistemicHolobionte',
      provenanceHash: digest(holobionteResult),
    },
    interpretationStatus: refuted ? 'refuted' : (verified ? 'verified' : 'pending'),
    epistemicMetrics: {
      immuneBlocked: immune.blocked,
      verifierResults: verifierResults.map(r => ({
        verifier: r.verifierDigest,
        status: r.status,
        receipt: r.receipt,
      })),
      memoryHit: holobionteResult.memory?.hasMemory || false,
      homeostasisPressure: holobionteResult.homeostasis?.pressure || 0,
    },
  };
}

function buildAssuranceAssemblyFromHolobionte(antigens, holobionteResults, context = {}) {
  const results = antigens.map((antigen, i) => holobionteToFormalResult(antigen, holobionteResults[i]));
  const verifiedResults = results.filter(r => r.status === 'verified');

  const verifications = [];
  for (const result of verifiedResults) {
    const vr = holobionteResults.find(h => h.immune?.verifierResults?.results?.some(vr => vr.resultId === result.resultId));
    if (vr && vr.immune.verifierResults.results) {
      for (const v of vr.immune.verifierResults.results) {
        if (v.status === 'verified' && v.receipt) {
          verifications.push({
            ...v.receipt,
            independent: true,
            status: 'verified',
          });
        }
      }
    }
  }

  const obligations = results.map(r => ({
    id: r.resultId,
    required: true,
    description: `Validation of claim: ${r.canonicalStatement}`,
  }));

  const coverage = results.map(r => ({
    resultId: r.resultId,
    obligationId: r.resultId,
    evidenceDigest: r.evidence.digest,
  }));

  const compositionRoots = verifiedResults.map(r => r.resultId);

  return {
    results: results.map(r => createFormalResult(r)),
    verifications,
    obligations,
    coverage,
    constraintAttestations: [],
    equivalences: [],
    relations: [],
    contradictionResolutions: [],
    compositionRoots,
    failureReuses: [],
    contributions: [],
    workerIds: context.workerIds || [],
    trustedVerifierDigests: context.trustedVerifierDigests || [],
  };
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
      evidence: claim.evidence?.[0] || { kind: 'observation' },
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