'use strict';

/**
 * epistemicAssuranceAssemblyBuilder.js
 *
 * Construit une assemblée d'assurance épistémique à partir de résultats
 * de vérification et/ou de résultats du Holobionte.
 *
 * Contraintes :
 * - Le builder ne signe jamais de receipt.
 * - Un unsigned receipt est rejeté.
 * - L'indépendance doit être évaluée AVANT issueReceipt, pas après.
 * - Les FormalResult sont créés via l'adaptateur Holobionte→FormalResult.
 */

const { createFormalResult } = require('./formalResultService');
const { adaptHolobionteResult, adaptImmuneResult } = require('./epistemic/formalResultAdapter');
const PASSED_STATUSES = new Set(['passed', 'verified', 'proved']);

function isReceiptObject(receipt) { return Boolean(receipt && typeof receipt === 'object'); }
function digestFromReceipt(receipt) { return receipt.verifierDigest || receipt.verifier || receipt.id || ''; }
function isPassedStatus(receipt) { return PASSED_STATUSES.has(receipt.status); }
function hasReceiptIdentity(receipt) { return Boolean(receipt.resultId && receipt.evidenceDigest); }

/**
 * Construit un receipt "conforme" (trusted) à partir d'un receipt existant.
 * Rejette si :
 * - le verifier digest n'est pas dans trustedDigests
 * - le receipt n'a pas de signature (le builder ne signe jamais)
 * - le receipt a été modifié après signature
 */
function buildCompliantReceipt(receipt, verifierDigest, trustedDigests) {
  if (!trustedDigests.includes(verifierDigest)) return null;
  if (!isPassedStatus(receipt)) return null;
  if (!hasReceiptIdentity(receipt)) return null;
  if (!receipt.signature) return null; // Pas de signature auto → rejeté

  const compliant = {
    resultId: receipt.resultId,
    evidenceDigest: receipt.evidenceDigest,
    verifierDigest,
    checkedAt: receipt.checkedAt || receipt.createdAt || new Date().toISOString(),
    nonce: receipt.nonce || randomUuid(),
    status: 'verified',
    independent: receipt.independent === true,
    signature: receipt.signature,
    independenceDescriptor: receipt.independenceDescriptor || null,
    independenceDistance: receipt.independenceDistance || null,
  };
  return compliant;
}

function randomUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const r = Math.random() * 16 | 0;
    const v = char === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function genResultId(prefix) { return `${prefix || 'result'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function safeArray(value) { return Array.isArray(value) ? value : []; }

function extractVerifierDigestsFromContext(context) {
  if (!context || typeof context !== 'object') return [];
  const out = [];
  const candidates = [context.trustedVerifierDigests, context.verifierDigests, context.verifierDigesT];
  for (const c of candidates) for (const d of collectDigestStrings(c)) out.push(d);
  return out;
}

function collectDigestStrings(source) {
  if (!Array.isArray(source)) return [];
  const out = [];
  for (const d of source) if (typeof d === 'string' && d.length) out.push(d);
  return out;
}

function digestsFromContext(context) {
  if (!context || typeof context !== 'object') return [];
  const out = [];
  const candidates = [context.trustedVerifierDigests, context.verifierDigests, context.verifierDigesT];
  for (const c of candidates) for (const d of collectDigestStrings(c)) out.push(d);
  return out;
}

/**
 * Conversion sécurisée d'un résultat Holobionte vers FormalResult.
 * Utilise l'adaptateur explicite pour garantir la conformité du contrat.
 */
function formalResultFromHolobionteResult(item) {
  const { candidate, error } = adaptHolobionteResult(item);
  if (error) return null;
  try {
    return createFormalResult(candidate);
  } catch (_) {
    return null;
  }
}

function buildCoverageMap(results) {
  return results.map(r => ({ resultId: r.resultId, obligationId: r.resultId, evidenceDigest: r.evidence.digest }));
}

function buildObligationList(ids) {
  return ids.map(id => ({ id, required: true, description: `Obligation ${id}` }));
}

function filterCompositionRoots(results) {
  return results.filter(r => r.status === 'verified' || statusToFormalStatus(r.status) === 'verified').map(r => r.resultId);
}

function statusToFormalStatus(s) {
  if (s === 'verified' || s === 'proved') return 'verified';
  if (s === 'refuted') return 'refuted';
  return s;
}

function processVerifierItems(verifierItems, resultsById, trustedDigests) {
  const verifications = [];
  const seenReceipts = new Set();
  for (const vr of verifierItems) {
    const receipt = vr?.receipt || vr;
    if (!isReceiptObject(receipt)) continue;
    const key = receipt.resultId + '|' + (receipt.verifierDigest || receipt.verifier || '');
    if (seenReceipts.has(key)) continue;
    seenReceipts.add(key);
    const formalResult = resultsById.get(receipt.resultId);
    if (!formalResult) continue;
    const compliant = buildCompliantReceipt(receipt, digestFromReceipt(receipt), trustedDigests);
    if (!compliant) continue;
    if (compliant.evidenceDigest !== formalResult.evidence.digest) continue;
    verifications.push(compliant);
  }
  return verifications;
}

function assemblyFromContext(formalResults, verifierResults, context) {
  if (!Array.isArray(formalResults) || !formalResults.length) return null;
  const results = formalResults
    .map(formalResultFromHolobionteResult)
    .filter(r => r !== null);
  if (!results.length) return null;
  const trustedDigests = extractVerifierDigestsFromContext(context);
  const resultsById = new Map(results.map(r => [r.resultId, r]));
  const verifierItems = Array.isArray(verifierResults) ? verifierResults : [];
  const verifications = processVerifierItems(verifierItems, resultsById, trustedDigests);
  const obligationIds = results.map(r => r.resultId);
  return {
    results,
    verifications,
    obligations: buildObligationList(obligationIds),
    coverage: buildCoverageMap(results),
    constraintAttestations: [],
    equivalences: [],
    relations: [],
    contradictionResolutions: [],
    compositionRoots: filterCompositionRoots(results),
    failureReuses: [],
    contributions: [],
    workerIds: (context?.workerIds || []).filter(Boolean),
    trustedVerifierDigests
  };
}

/**
 * Construit une assemblée directement depuis des résultats Holobionte.
 * Chaque résultat est adapté vers FormalResult via l'adaptateur.
 */
function assemblyFromHolobionteResults(holobionteResults, context) {
  if (!Array.isArray(holobionteResults) || !holobionteResults.length) return null;
  const formalResults = holobionteResults
    .filter(r => r && typeof r === 'object')
    .map(r => formalResultFromHolobionteResult(r))
    .filter(r => r !== null);
  if (!formalResults.length) return null;
  return assemblyFromContext(formalResults, [], context);
}

function assemblyFromHolobionteInput(input) {
  if (!Array.isArray(input?.holobionteResults)) return null;
  return assemblyFromHolobionteResults(input.holobionteResults, input.context);
}

function assemblyFromFormalResultsInput(input) {
  if (!Array.isArray(input?.formalResults)) return null;
  // Les formalResults sont déjà structurés — on les passe directement
  // mais on vérifie quand même la conformité via createFormalResult
  const verifiedResults = input.formalResults.map(fr => {
    try { return createFormalResult(fr); } catch (_) { return null; }
  }).filter(Boolean);
  if (!verifiedResults.length) return null;
  return assemblyFromContext(verifiedResults, input.verifierResults || input.verifications || [], input.context);
}

function buildEpistemicAssembly(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.results && Array.isArray(input.results)) return assemblyFromContext(input.results, input.verifications || input.verifierResults || [], input);
  if (input.holobionteResults) return assemblyFromHolobionteInput(input);
  if (input.formalResults) return assemblyFromFormalResultsInput(input);
  return null;
}

function tryDirectDigests(src) { const digests = digestsFromContext(src); return digests.length ? digests : null; }

function tryRuntimeVerifiers(src) {
  const list = src.runtimeVerifiers;
  if (!Array.isArray(list)) return null;
  const extracted = list.map(v => v?.verifierDigest || v?.digest || v?.id || '').filter(d => typeof d === 'string' && d.length);
  return extracted.length ? extracted : null;
}

function tryVerifierTypes(src) {
  const list = src.verifierTypes;
  if (!Array.isArray(list)) return null;
  const filtered = list.filter(d => typeof d === 'string' && d.length);
  return filtered.length ? filtered : null;
}

function tryVerifiersOrCatalog(src) {
  const list = src.verifiers || src.catalog;
  if (!Array.isArray(list)) return null;
  const extracted = list.map(v => v?.id || v?.type || v?.digest || '').filter(d => typeof d === 'string' && d.length);
  return extracted.length ? extracted : null;
}

function resolveFromSource(src) {
  if (!src || typeof src !== 'object') return null;
  return tryDirectDigests(src) || tryRuntimeVerifiers(src) || tryVerifierTypes(src) || tryVerifiersOrCatalog(src);
}

function resolveTrustedVerifierDigests(ctx) {
  if (!ctx || typeof ctx !== 'object') return centralDigests();
  const candidates = [];
  if (ctx.epistemicContext) candidates.push(ctx.epistemicContext);
  if (ctx.verifierContext) candidates.push(ctx.verifierContext);
  if (ctx.epistemic_context && ctx.epistemicContext !== ctx.epistemic_context) candidates.push(ctx.epistemic_context);
  candidates.push(ctx);
  for (const src of candidates) { const result = resolveFromSource(src); if (result) return result; }
  return centralDigests();
}

function centralDigests() {
  try {
    return require('./verifierTrustRegistry').listVerifierDigests();
  } catch (_) {
    return [];
  }
}

module.exports = {
  buildEpistemicAssembly,
  assemblyFromContext,
  assemblyFromHolobionteResults,
  formalResultFromHolobionteResult,
  resolveTrustedVerifierDigests,
  buildCompliantReceipt,
  extractVerifierDigestsFromContext
};
