'use strict';

const SCHEMA = 'genos.concept-publication/v1';
const SOURCES = { concept_registry: 'runtime', philosophy_registry: 'philosophy' };

function publish(entry) {
  const namespace = SOURCES[entry.source] || entry.source;
  const declared = entry.source !== 'unknown';
  return { ...entry, publication: { schema: SCHEMA, namespace, id: entry.id, version: 1,
    key: `${namespace}:${entry.id}@1` },
  lifecycle: { declared, implemented: entry.executable === true ? true : null,
    connected: null, activated: null, qualified: null,
    scope: 'catalogue', evidenceRefs: [] } };
}

function resolvePublished(reference, resolve) {
  const result = publish(resolve(reference));
  if (!reference || typeof reference !== 'object') return result;
  if (reference.version !== undefined && reference.version !== 1) return reject(result, 'version-inconnue');
  if (reference.namespace !== undefined && reference.namespace !== result.publication.namespace) {
    return reject(result, 'espace-de-noms-incompatible');
  }
  return result;
}

function reject(result, reason) {
  return { ...result, available: false, executable: false, reason };
}

module.exports = { SCHEMA, publish, resolvePublished };
