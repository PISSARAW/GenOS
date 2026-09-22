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

// Pré-enregistrer les types de base
registerVerifier({
  id: 'testResult',
  type: 'test',
  digest: 'sha256:' + 'a'.repeat(64),
  description: 'Default test result verifier',
});
registerVerifier({
  id: 'artifact',
  type: 'artifact',
  digest: 'sha256:' + 'b'.repeat(64),
  description: 'Artifact build verifier',
});

module.exports = {
  registerVerifier,
  unregisterVerifier,
  getVerifier,
  listVerifiers,
  listVerifierDigests,
  isTrusted,
  resolveTrustedVerifierDigests,
  clear,
};
