'use strict';

const path = require('node:path');
const values = require('./trinityProvenanceValues');
const ledger = require('./gvxDevelopmentLedger');
const { error } = require('./gvxContracts');

function eventId(scope, artifactId) {
  return `gvx-artifact-binding:${values.digest({ scope, artifactId })}`;
}

function store() {
  return require('./gvxArtifactStore').createStore(process.env.GENOS_GVX_ARTIFACT_ROOT
    || path.join(process.cwd(), '.genos', 'gvx', 'artifacts'));
}

async function register(db, input) {
  if (typeof input.kind !== 'string' || !input.kind.trim()) throw error('GVX_ARTIFACT_KIND_REQUIRED');
  const saved = await (await store()).write({ bytes: input.bytes });
  const artifact = { artifactId: saved.artifactRef, sha256: saved.artifactHash, kind: input.kind };
  const scope = values.clone(input.scope);
  await ledger.appendEvent(db, { id: eventId(scope, artifact.artifactId), ...scope,
    type: 'evidence_attached', payload: { kind: 'experimental_artifact', artifact } });
  return artifact;
}

async function resolve(db, input) {
  const event = await ledger.getEvent(db, eventId(input.scope, input.reference.artifactId), input.scope);
  if (!event || event.payload.kind !== 'experimental_artifact') throw error('GVX_MANIFEST_ARTIFACT_UNRESOLVED');
  if (values.digest(event.payload.artifact) !== values.digest(input.reference)) throw error('GVX_MANIFEST_ARTIFACT_CHANGED');
  const bytes = await (await store()).read({ artifactRef: input.reference.artifactId });
  if (values.hashBytes(bytes) !== input.reference.sha256) throw error('GVX_MANIFEST_ARTIFACT_CHANGED');
  return { ...input.reference, byteLength: bytes.length, eventId: event.id, integrity: 'verified' };
}

module.exports = { register, resolve };
