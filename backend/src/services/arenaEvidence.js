/**
 * GenOS Arena Evidence Helpers (N4)
 * Decides which claim evidence counts as verifiable proof.
 * A bare non-empty string ("trust me") is NOT proof: a string only counts
 * when it is long enough AND carries a checkable marker (URL, file path
 * with extension, or hex hash). Structured receipt objects keep counting
 * as evidence (verified separately by tangibleEvidence).
 */

const URL_MARKER = /https?:\/\/|www\./i;
const FILE_PATH_MARKER = /(?:^|\s)(?:[\w.~@-]+\/)*[\w.~@-]+\.[A-Za-z]{2,8}(?:\s|$|[.,;:])/;
const HASH_MARKER = /[0-9a-f]{8,}/i;
const MIN_EVIDENCE_TEXT_LENGTH = 20;

function isVerifiableEvidenceText(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < MIN_EVIDENCE_TEXT_LENGTH) return false;
  return URL_MARKER.test(text) || FILE_PATH_MARKER.test(text) || HASH_MARKER.test(text);
}

function isStructuredReceipt(item) {
  return Boolean(item) && typeof item === 'object';
}

function singleEvidenceCounts(item) {
  if (isStructuredReceipt(item)) return true;
  return isVerifiableEvidenceText(item);
}

function evidenceList(evidence) {
  if (Array.isArray(evidence)) return evidence;
  if (evidence === null || evidence === undefined) return [];
  return [evidence];
}

function tangibleEvidence(value) {
  return evidenceList(value).filter(isTangibleReceipt);
}

function isTangibleReceipt(item) {
  if (!isStructuredReceipt(item)) return false;
  if (typeof item.receiptHash !== 'string') return false;
  if (!/^[a-f0-9]{64}$/i.test(item.receiptHash)) return false;
  return typeof item.source === 'string' && Boolean(item.source.trim());
}

function claimEvidenceItems(claim) {
  if (!claim) return [];
  const raw = claim.evidence || claim.receipts || claim.sourceRefs;
  return evidenceList(raw);
}

function claimHasVerifiableEvidence(claim) {
  const items = claimEvidenceItems(claim);
  if (items.length === 0) return false;
  return items.some(singleEvidenceCounts);
}

function claimsWithVerifiableSupport(claims) {
  if (!Array.isArray(claims) || claims.length === 0) return false;
  return claims.some(claimHasVerifiableEvidence);
}

function scoreClaimsEvidence(claims) {
  if (!Array.isArray(claims) || claims.length === 0) return 0;
  const total = claims.reduce(sumClaimEvidence, 0);
  return Math.max(-40, Math.min(40, total));
}

function sumClaimEvidence(acc, item) {
  const backed = tangibleEvidence(claimEvidenceItems(item)).length > 0;
  return acc + (backed ? 15 : -10);
}

module.exports = {
  isVerifiableEvidenceText,
  tangibleEvidence,
  claimHasVerifiableEvidence,
  claimsWithVerifiableSupport,
  scoreClaimsEvidence
};
