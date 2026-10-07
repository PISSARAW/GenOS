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
const { implementationManifest } = require('./verifierImplementationManifest');
const deploymentManifest = implementationManifest();

const registry = new Map();

const REGISTRY_VERSION = '1.0';
const REGISTRY_POLICY = 'aeis-v3';

function computeVerifierDigest(type, version) {
  const normalizedType = String(type || 'unknown');
  const normalizedVersion = String(version || REGISTRY_VERSION);
  const identity = `genos-verifier:v1:type:${normalizedType}:version:${normalizedVersion}:policy:${REGISTRY_POLICY}`;
  return `sha256:${crypto.createHash('sha256').update(identity).update(JSON.stringify(deploymentManifest)).digest('hex')}`;
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
  throw new Error(`Unregistered verifier type: ${type}`);
}

function resolveVerifierDigest(verifier) {
  if (!verifier || typeof verifier !== 'object') throw new Error('Verifier descriptor is required');
  if (verifier.verifierDigest) {
    if (!isTrusted(verifier.verifierDigest)) throw new Error('Untrusted verifier digest');
    return verifier.verifierDigest;
  }
  if (verifier.version && verifier.version !== REGISTRY_VERSION) throw new Error('Unregistered verifier version');
  const entry = findByType(verifier.type);
  if (!entry) throw new Error(`Unregistered verifier type: ${verifier.type}`);
  return entry.digest;
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
  'procedure_semantic',
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
  deploymentManifest,
};
