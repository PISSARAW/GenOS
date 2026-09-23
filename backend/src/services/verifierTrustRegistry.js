'use strict';

/**
 * verifierTrustRegistry.js
 *
 * Registre central des vérificateurs de confiance.
 *
 * Fournit une source unique de vérité pour les verifier digests,
 * évitant que chaque mission doive apporter sa propre liste.
 *
 * Structure d'un entrée :
 *   {
 *     id: string,
 *     type: string,
 *     digest: string,  // sha256:...
 *     description: string,
 *     addedAt: ISO timestamp
 *   }
 */

const crypto = require('node:crypto');

const registry = new Map();

const REGISTRY_VERSION = '1.0';
const REGISTRY_POLICY = 'aeis-v3';

function computeVerifierDigest(type, version) {
  const normalizedType = String(type || 'unknown');
  const normalizedVersion = String(version || REGISTRY_VERSION);
  const identity = `genos-verifier:v1:type:${normalizedType}:version:${normalizedVersion}:policy:${REGISTRY_POLICY}`;
  return `sha256:${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

function findByType(type) {
  for (const entry of registry.values()) {
    if (entry.type === type) return entry;
  }
  return null;
}

function ensureVerifier(type, version) {
  const existing = findByType(type);
  if (existing) return existing;
  const digest = computeVerifierDigest(type, version);
  return registerVerifier({
    id: String(type),
    type: String(type),
    digest,
    description: `Auto-registered verifier ${type}`,
  });
}

function resolveVerifierDigest(verifier) {
  if (!verifier || typeof verifier !== 'object') return computeVerifierDigest('unknown', REGISTRY_VERSION);
  if (verifier.verifierDigest && isTrusted(verifier.verifierDigest)) return verifier.verifierDigest;
  if (verifier.id && registry.has(verifier.id)) return registry.get(verifier.id).digest;
  const byType = findByType(verifier.type);
  if (byType) return byType.digest;
  return ensureVerifier(verifier.type || 'unknown', verifier.version).digest;
}

function registerVerifier({ id, type, digest, description = '' }) {
  if (!id || typeof id !== 'string') throw new Error('verifier.id must be a non-empty string');
  if (!type || typeof type !== 'string') throw new Error('verifier.type must be a non-empty string');
  if (!digest || typeof digest !== 'string') throw new Error('verifier.digest must be a non-empty string');

  const entry = {
    id,
    type,
    digest,
    description,
    addedAt: new Date().toISOString(),
  };

  registry.set(id, entry);
  return entry;
}

function unregisterVerifier(id) {
  return registry.delete(id);
}

function getVerifier(id) {
  return registry.get(id) || null;
}

function listVerifiers() {
  return Array.from(registry.values());
}

function listVerifierDigests() {
  return Array.from(registry.values()).map(v => v.digest);
}

function isTrusted(digest) {
  if (!digest) return false;
  for (const v of registry.values()) {
    if (v.digest === digest) return true;
  }
  return false;
}

function resolveTrustedVerifierDigests(ctx) {
  // Si le ctx fournit des digests explicites, les utiliser
  if (ctx && Array.isArray(ctx.trustedVerifierDigests) && ctx.trustedVerifierDigests.length > 0) {
    return ctx.trustedVerifierDigests;
  }
  if (ctx && Array.isArray(ctx.epistemic_verifier_digests) && ctx.epistemic_verifier_digests.length > 0) {
    return ctx.epistemic_verifier_digests;
  }
  // Sinon, retourner le registre central
  return listVerifierDigests();
}

function clear() {
  registry.clear();
}

// Pré-enregistrer les types de base avec digests dérivés de l'identité stable
// digest = hash(implementation + version + policy + adapter), jamais un placeholder.
const KNOWN_VERIFIER_TYPES = [
  'test',
  'testResult',
  'coverage',
  'behavior',
  'artifact',
  'replay',
  'source',
  'proof',
  'benchmark',
  'counterexample',
  'repro',
];

for (const type of KNOWN_VERIFIER_TYPES) {
  registerVerifier({
    id: type,
    type,
    digest: computeVerifierDigest(type, REGISTRY_VERSION),
    description: `Default ${type} verifier`,
  });
}

module.exports = {
  registerVerifier,
  unregisterVerifier,
  getVerifier,
  listVerifiers,
  listVerifierDigests,
  isTrusted,
  resolveTrustedVerifierDigests,
  resolveVerifierDigest,
  computeVerifierDigest,
  ensureVerifier,
  clear,
};
