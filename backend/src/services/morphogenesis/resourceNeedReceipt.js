'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function payloadFor({ groupId, workerId, need, context }) {
  const requested = requestedTokens(need);
  return canonical({ schemaVersion: 1, groupId: String(groupId), workerId: String(workerId),
    missionId: String(context?.missionId || ''), promptDigest: String(context?.promptDigest || ''),
    needId: needId(need), requestedTokens: requested, minimumTokens: minimumTokens(need, requested),
    marginalValue: bounded(need.rawMarginalValue ?? need.marginalValue, 0, 1),
    confidence: bounded(need.confidence, 0, 1), evidenceRefs: evidenceRefsOf(need) });
}

function requestedTokens(need) { return Math.max(0, Math.floor(Number(need.requestedTokens) || 0)); }

function minimumTokens(need, requested) {
  return Math.max(0, Math.min(requested, Math.floor(Number(need.minimumTokens ?? requested) || 0)));
}

function needId(need) { return String(need.id || need.needId || need.bidId || ''); }

function evidenceRefsOf(need) {
  if (!Array.isArray(need.evidenceRefs)) return [];
  return [...new Set(need.evidenceRefs.map(String).filter(Boolean))].sort();
}

function bounded(value, low, high) {
  const number = Number(value);
  return Math.max(low, Math.min(high, Number.isFinite(number) ? number : low));
}

function digestFromInput(input) {
  const text = JSON.stringify(payloadFor(input));
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

function digestFor(input) { return digestFromInput(input); }

function contextValid(context) {
  return Boolean(context?.missionId && /^sha256:[a-f0-9]{64}$/i.test(context.promptDigest || ''));
}

function receiptValid(receipt, digest, evidenceRefs) {
  return evidenceAudit.isVerifiedReceipt(receipt) && receipt.evidenceDigest === digest
    && evidenceRefs.includes(receipt.resultId);
}

function bindInput({ groupId, workerId, need, context }) {
  if (!contextValid(context)) return null;
  const digest = digestFromInput({ groupId, workerId, need, context });
  const payload = payloadFor({ groupId, workerId, need, context });
  const receipts = Array.isArray(need.proofReceipts) ? need.proofReceipts : [];
  const valid = receipts.length > 0 && receipts.every((receipt) =>
    receiptValid(receipt, digest, payload.evidenceRefs));
  return valid ? { ...need, workerId: String(workerId), missionId: payload.missionId,
    promptDigest: payload.promptDigest, resourceNeedDigest: digest,
    proofDigest: digest, proofReceipts: receipts } : null;
}

function bindNeed(input) { return bindInput(input); }

function receiptMatchesNeed(allocation, receipt) {
  return Boolean(allocation.workerId && allocation.resourceNeedDigest
    && allocation.resourceNeedDigest === digestFromInput({ groupId: allocation.groupId,
      workerId: allocation.workerId, need: allocation,
      context: { missionId: allocation.missionId, promptDigest: allocation.promptDigest } })
    && allocation.proofDigest === allocation.resourceNeedDigest
    && evidenceAudit.isVerifiedReceipt(receipt)
    && receipt.evidenceDigest === allocation.resourceNeedDigest);
}

module.exports = { bindNeed, digestFor, receiptMatchesNeed };
