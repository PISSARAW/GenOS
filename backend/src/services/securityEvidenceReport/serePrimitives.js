'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../stateFingerprint');

const DOSSIER_SCHEMA = 'genos.security-evidence-report-dossier/v1';
const VERIFICATION_SCHEMA = 'genos.security-evidence-report-verification/v1';
const PRESENTATION_SCHEMA = 'genos.security-evidence-report-presentation/v1';
const BUNDLE_SCHEMA = 'genos.security-evidence-report-bundle/v1';

const AUTHORITY_MODEL = Object.freeze({
  sourceOfTruth: 'data_evidence_verifiers',
  presentationHasAuthority: false,
  pdfOrHtmlIsPresentationOnly: true,
  verifierQuorumRequired: true
});

function failure(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function parseCanonical(json, code) {
  try {
    const parsed = JSON.parse(json);
    if (canonicalJson(parsed) !== json) throw failure(code);
    return parsed;
  } catch (error) {
    if (error.code === code) throw error;
    throw failure(code);
  }
}

function text(value, code, maxLength = 512) {
  if (typeof value !== 'string') throw failure(code);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw failure(code);
  return trimmed;
}

function optionalText(value, code, maxLength = 512) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, code, maxLength);
}

function digest(value, code) {
  const raw = text(value, code, 128).replace(/^sha256:/i, '');
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw failure(code);
  return raw.toLowerCase();
}

function computeDigest(value) {
  if (typeof value === 'string') {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
  return fingerprint(value);
}

function isoTimestamp(value, code) {
  const raw = text(value, code, 64);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw failure(code);
  return new Date(parsed).toISOString();
}

function stringList(values, code, maxItems = 128) {
  if (!Array.isArray(values)) throw failure(code);
  const normalized = [...new Set(values.map((item) => text(item, code, 512)))].sort();
  if (normalized.length > maxItems) throw failure(code);
  return normalized;
}

function optionalStringList(values, code, maxItems = 128) {
  if (values === undefined || values === null) return [];
  return stringList(values, code, maxItems);
}

function ensureUniqueIds(items, code) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw failure(code, `Duplicate identifier: ${item.id}`);
    seen.add(item.id);
  }
  return items;
}

function matchesScopePattern(target, pattern) {
  if (pattern === target) return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return target.startsWith(prefix);
  }
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2);
    return target.startsWith(prefix);
  }
  return false;
}

function targetInScope(target, scope) {
  const excluded = (scope.outOfScopeTargets || []).some((pattern) => matchesScopePattern(target, pattern));
  if (excluded) return false;
  return (scope.inScopeTargets || []).some((pattern) => matchesScopePattern(target, pattern));
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = {
  DOSSIER_SCHEMA,
  VERIFICATION_SCHEMA,
  PRESENTATION_SCHEMA,
  BUNDLE_SCHEMA,
  AUTHORITY_MODEL,
  failure,
  canonicalJson,
  parseCanonical,
  text,
  optionalText,
  digest,
  computeDigest,
  isoTimestamp,
  stringList,
  optionalStringList,
  ensureUniqueIds,
  matchesScopePattern,
  targetInScope,
  escapeHtml,
  canonicalValue,
  fingerprint
};
