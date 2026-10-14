'use strict';

// Trinity evidence audit (ADR 0281). Only verified evidence[] ids in this
// dossier weigh. URLs and repository paths are not resolved by this pure audit
// and therefore weigh zero until another verifier binds them to evidence.
// Placeholders and self-citations also weigh zero.

const PLACEHOLDER = /^\s*(evidence\d*|n\/a|none|null|todo|tbd|test|verified|v\u00e9rifi\u00e9|ok)\s*$/i;
const ANGLE = /<[^>]*>/;
const EXAMPLE = /example\.(com|org|net)/i;
const BARE_DOC = /^(readme|docs?|wiki|changelog)(\.\w+)?$/i;
const SELF_CITE = /trinity mission:|^(task|mission)\s*:|^mission[_ ]?prompt\s*:/i;
const verifierReceipts = require('./epistemicVerifierReceiptService');
const verifierTrust = require('./verifierTrustRegistry');

function evidenceIdsOf(report) {
  const items = report && Array.isArray(report.evidence) ? report.evidence : [];
  const ids = new Set();
  for (const item of items) {
    const id = typeof item === 'string' ? item : item?.id;
    if (typeof id === 'string' && id.trim()) ids.add(id.trim());
  }
  return ids;
}

function isVerifiedReceipt(receipt) {
  if (receipt?.status !== 'verified' || receipt.independent !== true
    || typeof receipt.evidenceDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(receipt.evidenceDigest)
    || !receipt.independenceDescriptor?.actorId || !receipt.independenceDescriptor?.workspaceId) return false;
  try {
    return verifierReceipts.validateReceipt(receipt, verifierTrust.resolveTrustedVerifierDigests({}));
  } catch (_) {
    return false;
  }
}

function isIndependentlyVerifiedClaim(claim) {
  const receipts = Array.isArray(claim?.verificationReceipts) ? claim.verificationReceipts : [];
  return claim?.verificationLevel === 'independent_deterministic'
    && receipts.length > 0 && receipts.every((entry) => isVerifiedReceipt(entry.receipt));
}

function isPlaceholder(text) {
  if (PLACEHOLDER.test(text) || ANGLE.test(text) || EXAMPLE.test(text)) return true;
  return BARE_DOC.test(text) || SELF_CITE.test(text);
}

function locatorWeight() {
  return 0;
}

function refWeight(ref, ids) {
  const text = String(ref || '').trim();
  if (!text) return 0;
  if (ids && ids.has(text)) return 2;
  if (isPlaceholder(text)) return 0;
  return locatorWeight();
}

function claimRefs(claim) {
  if (!claim || typeof claim !== 'object') return [];
  const raw = [...(claim.evidence || []), ...(claim.receipts || []), ...(claim.sourceRefs || [])];
  return raw.map((ref) => String(ref ?? '').trim()).filter(Boolean);
}

function auditClaim(claim, ids) {
  const refs = claimRefs(claim);
  let weight = 0;
  let resolvable = 0;
  for (const ref of refs) {
    const w = refWeight(ref, ids);
    weight += w;
    if (w > 0) resolvable += 1;
  }
  return { weight, resolvable, total: refs.length };
}

function auditReport(report) {
  const ids = evidenceIdsOf(report);
  const claims = report && Array.isArray(report.claims) ? report.claims : [];
  let proven = 0;
  let resolvableRefs = 0;
  let placeholderRefs = 0;
  for (const claim of claims) {
    const audited = auditClaim(claim, ids);
    if (audited.weight >= 1 && isIndependentlyVerifiedClaim(claim)) proven += 1;
    resolvableRefs += audited.resolvable;
    placeholderRefs += audited.total - audited.resolvable;
  }
  return { proven, resolvableRefs, placeholderRefs, claimCount: claims.length };
}

module.exports = {
  evidenceIdsOf,
  refWeight,
  claimRefs,
  auditClaim,
  auditReport,
  isVerifiedReceipt,
  isIndependentlyVerifiedClaim
};
