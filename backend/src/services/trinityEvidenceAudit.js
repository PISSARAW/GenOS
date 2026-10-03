'use strict';

// Trinity evidence audit (ADR 0281). A reference only weighs if it resolves:
// an evidence[] id of the same dossier, a verifiable URL, or a repo path.
// Placeholders (evidence1, <source-ref>, example.com, bare README), bare
// declarations and self-citations of the mission text weigh zero. Pure.

const PLACEHOLDER = /^\s*(evidence\d*|n\/a|none|null|todo|tbd|test|verified|v\u00e9rifi\u00e9|ok)\s*$/i;
const ANGLE = /<[^>]*>/;
const EXAMPLE = /example\.(com|org|net)/i;
const BARE_DOC = /^(readme|docs?|wiki|changelog)(\.\w+)?$/i;
const SELF_CITE = /trinity mission:|^(task|mission)\s*:|^mission[_ ]?prompt\s*:/i;
const URL = /^https?:\/\/([^\s/]+)/i;
const REPO_PATH = /[\w.-]+\/[\w./-]+/;

function evidenceIdsOf(report) {
  const items = report && Array.isArray(report.evidence) ? report.evidence : [];
  const ids = new Set();
  for (const item of items) {
    const id = typeof item === 'string' ? item : item?.id;
    if (typeof id === 'string' && id.trim()) ids.add(id.trim());
  }
  return ids;
}

function isPlaceholder(text) {
  if (PLACEHOLDER.test(text) || ANGLE.test(text) || EXAMPLE.test(text)) return true;
  return BARE_DOC.test(text) || SELF_CITE.test(text);
}

function locatorWeight(text) {
  if (URL.test(text)) return 1;
  if (REPO_PATH.test(text)) return 1;
  return 0;
}

function refWeight(ref, ids) {
  const text = String(ref || '').trim();
  if (!text) return 0;
  if (ids && ids.has(text)) return 2;
  if (isPlaceholder(text)) return 0;
  return locatorWeight(text);
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
    if (audited.weight >= 1) proven += 1;
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
  auditReport
};
