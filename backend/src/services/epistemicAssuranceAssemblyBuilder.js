'use strict';

/**
 * epistemicAssuranceAssemblyBuilder.js
 *
 * Produit l'objet `report.epistemicAssembly` attendu par
 * epistemicAssurancePolicy dans le pipeline de promotion AEIS.
 *
 * Flux : AEIS → FormalResults → obligation census → verifier receipts →
 * assemblyBuilder → report.epistemicAssembly → promotion gate.
 */

const { createFormalResult } = require('./formalResultService');
const verifierReceipts = require('./epistemicVerifierReceiptService');

const PASSED_STATUSES = new Set(['passed', 'verified', 'proved']);

function formalResultFromHolobionteResult(item) {
  if (item.resultId && item.canonicalStatement) {
    return createFormalResult(item);
  }
  const result = {
    resultId: item.resultId || item.id || `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    canonicalStatement: item.canonicalStatement || item.claim || '(sans énoncé)',
    status: item.status || 'pending',
    evidence: item.evidence || { kind: 'observation', content: {} },
    assumptions: Array.isArray(item.assumptions) ? item.assumptions : [],
    validityDomain: item.validityDomain || { domain: 'general', coverage: 0, constraints: 0 },
    dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
    provenance: item.provenance || {
      createdAt: new Date().toISOString(),
      actor: item.producer?.actor || 'unknown',
      source: { type: 'holobionte', uri: 'genos://holobionte/epistemic', digest: '' },
      inputs: [],
      transformations: []
    },
    producer: item.producer || { model: 'holobionte', version: '1.0' }
  };
  return createFormalResult(result);
}

function normalizeVerifierReceipt(receipt, trustedVerifierDigests) {
  if (!receipt || typeof receipt !== 'object') return null;
  const verifierDigest = receipt.verifierDigest || receipt.verifier || receipt.id || '';
  if (!trustedVerifierDigests.includes(verifierDigest)) return null;
  const hasIndependentFlag = receipt.independent === true;
  if (!PASSED_STATUSES.has(receipt.status)) return null;
  if (!receipt.resultId || !receipt.evidenceDigest) return null;
  const compliantReceipt = {
    resultId: receipt.resultId,
    evidenceDigest: receipt.evidenceDigest,
    verifierDigest,
    checkedAt: receipt.checkedAt || receipt.createdAt || new Date().toISOString(),
    nonce: receipt.nonce || cryptoRandomUUID(),
    status: 'verified',
    independent: hasIndependentFlag,
    signature: receipt.signature
  };
  if (!compliantReceipt.signature) {
    compliantReceipt.signature = verifierReceipts.signatureFor(compliantReceipt);
  }
  return compliantReceipt;
}

function cryptoRandomUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function extractVerifierDigestsFromContext(context) {
  if (!context || typeof context !== 'object') return [];
  const digests = [];
  const sources = [
    context.trustedVerifierDigests,
    context.verifierDigests,
    context.verifierDigesT
  ];
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const d of source) {
        if (typeof d === 'string' && d.length) digests.push(d);
      }
    }
  }
  return digests;
}

function assemblyFromContext(formalResults, verifierResults, context) {
  if (!Array.isArray(formalResults) || !formalResults.length) {
    return null;
  }
  const results = formalResults.map(formalResultFromHolobionteResult);
  const trustedDigests = extractVerifierDigestsFromContext(context);
  const resultsById = new Map(results.map(r => [r.resultId, r]));

  const verifications = [];
  const seenReceipts = new Set();
  const verifierItems = Array.isArray(verifierResults) ? verifierResults : [];

  for (const vr of verifierItems) {
    if (!vr || typeof vr !== 'object') continue;
    const receipt = vr.receipt || vr;
    const key = receipt.resultId + '|' + (receipt.verifierDigest || receipt.verifier || '');
    if (seenReceipts.has(key)) continue;
    seenReceipts.add(key);
    const formalResult = resultsById.get(receipt.resultId);
    if (!formalResult) continue;
    const compliant = normalizeVerifierReceipt(receipt, trustedDigests);
    if (!compliant) continue;
    if (compliant.evidenceDigest !== formalResult.evidence.digest) continue;
    verifications.push(compliant);
  }

  const obligationIds = results.map(r => r.resultId);
  const coverage = results.map(r => ({
    resultId: r.resultId,
    obligationId: r.resultId,
    evidenceDigest: r.evidence.digest
  }));

  const compositionRoots = results
    .filter(r => r.status === 'verified' || r.status === 'proved')
    .map(r => r.resultId);

  return {
    results,
    verifications,
    obligations: obligationIds.map(id => ({
      id,
      required: true,
      description: `Obligation ${id}`
    })),
    coverage,
    constraintAttestations: [],
    equivalences: [],
    relations: [],
    contradictionResolutions: [],
    compositionRoots,
    failureReuses: [],
    contributions: [],
    workerIds: (context?.workerIds || []).filter(Boolean),
    trustedVerifierDigests
  };
}

function buildEpistemicAssembly(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.results && Array.isArray(input.results)) {
    return assemblyFromContext(
      input.results,
      input.verifications || input.verifierResults || [],
      input
    );
  }
  if (input.holobionteResults && Array.isArray(input.holobionteResults)) {
    return assemblyFromHolobionteResults(input.holobionteResults, input.context);
  }
  if (input.formalResults && Array.isArray(input.formalResults)) {
    return assemblyFromContext(
      input.formalResults,
      input.verifierResults || input.verifications || [],
      input.context
    );
  }
  return null;
}

function assemblyFromHolobionteResults(holobionteResults, context) {
  if (!Array.isArray(holobionteResults) || !holobionteResults.length) return null;
  const formalResults = holobionteResults
    .filter(r => r && typeof r === 'object')
    .map(r => {
      if (r.resultId && r.canonicalStatement) {
        return createFormalResult(r);
      }
      const item = {
        resultId: r.resultId || r.id || `hresult-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        canonicalStatement: r.canonicalStatement || r.claim || '(holobionte result)',
        status: r.status || (r.refuted ? 'refuted' : (r.verified ? 'verified' : 'pending')),
        evidence: {
          kind: r.evidence?.kind || 'observation',
          content: r.evidence?.content || {},
          digest: r.evidence?.digest || ''
        },
        assumptions: Array.isArray(r.assumptions) ? r.assumptions : [],
        validityDomain: r.validityDomain || { domain: 'general', coverage: 0, constraints: 0 },
        dependencies: Array.isArray(r.dependencies) ? r.dependencies : [],
        provenance: r.provenance || {
          createdAt: new Date().toISOString(),
          actor: 'holobionte',
          source: { type: 'holobionte', uri: 'genos://holobionte', digest: '' },
          inputs: [],
          transformations: []
        },
        producer: r.producer || { model: 'holobionte', version: '1.0' }
      };
      return createFormalResult(item);
    });

  return assemblyFromContext(formalResults, [], context);
}

function resolveTrustedVerifierDigests(ctx) {
  if (!ctx || typeof ctx !== 'object') return [];
  const sources = [];
  if (ctx.epistemicContext) sources.push(ctx.epistemicContext);
  if (ctx.verifierContext) sources.push(ctx.verifierContext);
  if (ctx.epistemic_context && ctx.epistemicContext !== ctx.epistemic_context) sources.push(ctx.epistemic_context);
  sources.push(ctx);
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    const digests = extractVerifierDigestsFromContext(src);
    if (digests.length) return digests;
    if (Array.isArray(src.runtimeVerifiers)) {
      const extracted = src.runtimeVerifiers
        .map(v => v?.verifierDigest || v?.digest || v?.id || '')
        .filter(d => typeof d === 'string' && d.length);
      if (extracted.length) return extracted;
    }
    if (Array.isArray(src.verifierTypes)) {
      const filtered = src.verifierTypes.filter(d => typeof d === 'string' && d.length);
      if (filtered.length) return filtered;
    }
    if (Array.isArray(src.verifiers) || Array.isArray(src.catalog)) {
      const list = src.verifiers || src.catalog;
      const extracted = list
        .map(v => v?.id || v?.type || v?.digest || '')
        .filter(d => typeof d === 'string' && d.length);
      if (extracted.length) return extracted;
    }
  }
  return [];
}

module.exports = {
  buildEpistemicAssembly,
  assemblyFromContext,
  assemblyFromHolobionteResults,
  formalResultFromHolobionteResult,
  resolveTrustedVerifierDigests,
  normalizeVerifierReceipt,
  extractVerifierDigestsFromContext
};
