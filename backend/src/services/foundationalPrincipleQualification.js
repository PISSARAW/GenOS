'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalValue, fingerprint } = require('./stateFingerprint');

const MANIFEST_SCHEMA = 'genos.foundational-principles-qualification/v2';
const RECEIPT_SCHEMA = 'genos.foundational-principles-qualification-receipt/v2';
const EXPECTED = [
  ['F01', 'Runtime d’agents reproductible et supervisé'],
  ['F02', 'État versionné'],
  ['F03', 'Exécution contrefactuelle'],
  ['F04', 'Branches, forks, snapshots, diffs et replay'],
  ['F05', 'Preuve avant promotion'],
  ['F06', 'Distinction entre succès technique et vérité'],
  ['F07', 'Falsifiabilité et contre-exemples'],
  ['F08', 'Provenance'],
  ['F09', 'Reçus vérifiables'],
  ['F10', 'Décisions bornées'],
  ['F11', 'Autorité explicite'],
  ['F12', 'Leases d’outils'],
  ['F13', 'Budgets de tokens, temps, CPU, spawn et délégation'],
  ['F14', 'Isolation des workspaces'],
  ['F15', 'Garde-fou fail-closed'],
  ['F16', 'Évidence indépendante'],
  ['F17', 'Promotion, rejet, quarantaine et escalade'],
  ['F18', 'Résilience et récupération'],
  ['F19', 'Séparation entre concept, métaphore biologique et capacité réellement implémentée']
];

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function nonEmptyText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw failure(code);
  return value.trim();
}

function nonEmptyList(value, code) {
  if (!Array.isArray(value) || value.length === 0) throw failure(code);
  return value;
}

function assertManifestHeader(manifest) {
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA) throw failure('FOUNDATION_MANIFEST_SCHEMA_INVALID');
  nonEmptyText(manifest.baselineRevision, 'FOUNDATION_MANIFEST_REVISION_REQUIRED');
  nonEmptyText(manifest.qualificationRevision, 'FOUNDATION_QUALIFICATION_REVISION_REQUIRED');
  nonEmptyText(manifest.scope, 'FOUNDATION_MANIFEST_SCOPE_REQUIRED');
  if (manifest.ratingScale?.['4'] === undefined) throw failure('FOUNDATION_RATING_SCALE_INVALID');
  if (!Array.isArray(manifest.principles) || manifest.principles.length !== EXPECTED.length) {
    throw failure('FOUNDATION_PRINCIPLE_SET_INVALID');
  }
}

function assertSeparation(entry) {
  const concept = nonEmptyText(entry.concept, 'FOUNDATION_CONCEPT_REQUIRED');
  const capability = nonEmptyText(entry.capability, 'FOUNDATION_CAPABILITY_REQUIRED');
  if (concept === capability || entry.metaphor === capability) {
    throw failure('FOUNDATION_CONCEPT_CAPABILITY_CONFLATED');
  }
  if (entry.metaphor !== null) nonEmptyText(entry.metaphor, 'FOUNDATION_METAPHOR_INVALID');
}

function assertEntry(entry, expected) {
  if (entry?.id !== expected[0] || entry.principle !== expected[1]) {
    throw failure('FOUNDATION_PRINCIPLE_IDENTITY_INVALID');
  }
  if (entry.score !== 4) throw failure('FOUNDATION_SCORE_FOUR_REQUIRED');
  assertSeparation(entry);
  nonEmptyList(entry.implementationRefs, 'FOUNDATION_IMPLEMENTATION_REQUIRED');
  nonEmptyList(entry.evidenceTests, 'FOUNDATION_EVIDENCE_REQUIRED');
  nonEmptyList(entry.documentationRefs, 'FOUNDATION_DOCUMENTATION_REQUIRED');
  nonEmptyList(entry.limitations, 'FOUNDATION_LIMIT_REQUIRED').forEach((limit) =>
    nonEmptyText(limit, 'FOUNDATION_LIMIT_INVALID'));
}

function normalizedRelative(reference) {
  const value = nonEmptyText(reference, 'FOUNDATION_REFERENCE_INVALID').replaceAll('\\', '/');
  if (path.posix.isAbsolute(value) || value.split('/').includes('..')) {
    throw failure('FOUNDATION_REFERENCE_OUTSIDE_REPOSITORY');
  }
  return value;
}

function assertConfined(root, resolved) {
  const relation = path.relative(root, resolved);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    throw failure('FOUNDATION_REFERENCE_OUTSIDE_REPOSITORY');
  }
}

function resolveReference(root, reference) {
  const relative = normalizedRelative(reference);
  const resolved = path.resolve(root, relative);
  assertConfined(root, resolved);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
    throw failure('FOUNDATION_REFERENCE_MISSING');
  }
  const canonical = fs.realpathSync(resolved);
  assertConfined(root, canonical);
  return { relative, resolved: canonical };
}

function allReferences(manifest) {
  const references = new Set(manifest.evidenceSuite || []);
  references.add(manifest.lifecyclePolicy?.revocationLedger);
  for (const entry of manifest.principles) {
    for (const key of ['implementationRefs', 'evidenceTests', 'documentationRefs']) {
      for (const reference of entry[key]) references.add(reference);
    }
  }
  return [...references].sort();
}

function assertEvidenceSuite(manifest) {
  const suite = new Set(nonEmptyList(manifest.evidenceSuite, 'FOUNDATION_SUITE_REQUIRED'));
  for (const entry of manifest.principles) {
    if (entry.evidenceTests.some((test) => !suite.has(test))) {
      throw failure('FOUNDATION_EVIDENCE_OUTSIDE_SUITE');
    }
  }
}

function assertLifecyclePolicy(manifest) {
  const policy = manifest.lifecyclePolicy;
  if (!Number.isInteger(policy?.evidenceMaxAgeMs) || policy.evidenceMaxAgeMs <= 0) {
    throw failure('FOUNDATION_EVIDENCE_MAX_AGE_INVALID');
  }
  if (!Number.isInteger(policy.maxFutureSkewMs) || policy.maxFutureSkewMs < 0) {
    throw failure('FOUNDATION_FUTURE_SKEW_INVALID');
  }
  nonEmptyText(policy.revocationLedger, 'FOUNDATION_REVOCATION_LEDGER_REQUIRED');
}

function validateManifest(manifest, repositoryRoot) {
  assertManifestHeader(manifest);
  manifest.principles.forEach((entry, index) => assertEntry(entry, EXPECTED[index]));
  assertEvidenceSuite(manifest);
  assertLifecyclePolicy(manifest);
  const root = fs.realpathSync(repositoryRoot);
  const references = allReferences(manifest).map((reference) => resolveReference(root, reference));
  return { root, references };
}

function validDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function assertObservation(manifest, test, observation) {
  const valid = observation && observation.exitCode === 0
    && observation.revision === manifest.qualificationRevision
    && validDigest(observation.outputDigest)
    && !Number.isNaN(Date.parse(observation.observedAt));
  if (!valid) throw failure('FOUNDATION_EXECUTABLE_EVIDENCE_REQUIRED');
  return { test, outputDigest: observation.outputDigest };
}

function sourceRecords(validation) {
  return validation.references.map((reference) => ({ path: reference.relative,
    digest: crypto.createHash('sha256').update(fs.readFileSync(reference.resolved)).digest('hex') }));
}

function qualificationBody(manifest, validation, observations) {
  const evidence = manifest.evidenceSuite.map((test) =>
    assertObservation(manifest, test, observations[test]));
  const sources = sourceRecords(validation);
  return { schema: RECEIPT_SCHEMA, baselineRevision: manifest.baselineRevision,
    qualificationRevision: manifest.qualificationRevision, scope: manifest.scope,
    score: 4, qualifiedCount: manifest.principles.length,
    totalCount: EXPECTED.length, status: 'qualified-bounded-scope',
    universalClaim: false, authorizesPromotion: false,
    manifestHash: fingerprint(manifest), sourceDigest: fingerprint(sources), evidence };
}

function qualify(input) {
  const validation = validateManifest(input.manifest, input.repositoryRoot);
  const body = qualificationBody(canonicalValue(input.manifest), validation,
    input.observations || {});
  return { ...body, receiptHash: fingerprint(body) };
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (_) {
    throw failure('FOUNDATION_MANIFEST_READ_FAILED');
  }
}

module.exports = { MANIFEST_SCHEMA, RECEIPT_SCHEMA, EXPECTED, validateManifest,
  qualify, readManifest };
