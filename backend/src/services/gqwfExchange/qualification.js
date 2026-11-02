'use strict';

const manifestService = require('../gqwf/manifest');
const closureService = require('../gqwf/executionClosure');
const metadata = require('../gqwf/metadataStore');
const { sha256 } = require('../gqwf/objects');
const { digest } = require('../evidenceProtocol/canonical');
const { GqwfExchangeError, validateWorldShape, validateCandidate, validateQualificationPolicy } = require('./contract');

const same = (left, right) => digest(left) === digest(right);
const fail = (message) => { throw new GqwfExchangeError('GQWF_EXCHANGE_QUALIFICATION_INVALID', `GQWF Exchange qualification: ${message}`); };

function uniqueBlobs(manifest) {
  const blobs = new Map();
  for (const file of manifest.files) {
    const previous = blobs.get(file.hash);
    if (previous && previous.size !== file.size) fail('conflicting sizes for the same content hash.');
    blobs.set(file.hash, { hash: file.hash, size: file.size });
  }
  return [...blobs.values()].sort((left, right) => left.hash.localeCompare(right.hash));
}

function nativeManifest(world) {
  const rebuilt = manifestService.createManifest(world.manifest.files);
  if (!same(rebuilt.manifest, world.manifest) || rebuilt.hash !== world.rootHash
    || rebuilt.serialized !== world.manifestSerialized) fail('manifest or root differs from native canonical representation.');
  manifestService.parseManifest(world.manifestSerialized, world.rootHash);
  uniqueBlobs(world.manifest);
}

function nativeClosure(world) {
  const rebuilt = closureService.buildManifest(world.closure);
  if (!same(rebuilt, world.closure)) fail('closure would normalize declared protocol, assurance or inputs.');
  if (rebuilt.workspaceId !== world.workspaceId || rebuilt.rootHash !== world.rootHash) fail('closure is not bound to this world.');
  if (JSON.stringify(rebuilt) !== world.closureSerialized || metadata.digest(world.closureSerialized) !== world.closureHash) {
    fail('closure raw serialization or metadata digest differs.');
  }
  closureService.parseManifest(world.closureSerialized, { workspaceId: world.workspaceId,
    rootHash: world.rootHash, closureHash: world.closureHash });
}

function validateWorld(input) {
  const world = validateWorldShape(input);
  try { nativeManifest(world); nativeClosure(world); }
  catch (error) {
    if (error instanceof GqwfExchangeError) throw error;
    fail(error.message);
  }
  return world;
}

function environmentDigest(world) {
  const closure = world.closure;
  return digest({ command: closure.command, runtime: closure.runtime,
    dependencies: closure.dependencies, environment: closure.environment });
}

function qualifyWorld(input) {
  const world = validateWorld(input);
  return { worldId: world.worldId, worldDigest: digest(world), rootHash: world.rootHash, closureHash: world.closureHash,
    origin: world.origin, assurance: world.closure.assurance, environmentDigest: environmentDigest(world),
    qualificationLevel: 'descriptor-integrity', actionAuthorized: false };
}

function qualifyCandidate(inputWorld, inputCandidate, inputPolicy) {
  const world = validateWorld(inputWorld);
  const candidate = validateCandidate(inputCandidate);
  const policy = validateQualificationPolicy(inputPolicy);
  candidateBindings(world, candidate);
  if (!same(candidate.policy, { policyId: policy.policyId, version: policy.version })) fail('policy reference mismatch.');
  if (!policy.allowedOrigins.includes(world.origin.kind)) fail('world origin is not allowed under this policy.');
  return { ...qualifyWorld(world), candidateId: candidate.candidateId, candidateDigest: digest(candidate),
    baseHash: candidate.baseHash, baseGeneration: candidate.baseGeneration, headName: candidate.headName,
    predicate: candidate.predicate, policy: candidate.policy, verifierRefs: policy.verifierRefs, evidenceRefs: candidate.evidenceRefs };
}

function candidateBindings(world, candidate) {
  const expected = [world.worldId, digest(world), world.rootHash, world.closureHash, environmentDigest(world)];
  const actual = [candidate.worldId, candidate.worldDigest, candidate.rootHash, candidate.closureHash, candidate.environmentDigest];
  if (!same(expected, actual)) fail('candidate world, root, closure or environment binding mismatch.');
  if (!same(candidate.predicate.command, world.closure.command)) fail('predicate command differs from exact native executable and arguments.');
}

function assertCurrentContext(candidate, current) {
  const expected = [candidate.baseHash, candidate.baseGeneration, candidate.environmentDigest, candidate.policy];
  const actual = [current.rootHash, current.generation, current.environmentDigest, current.policy];
  if (!same(expected, actual)) fail('candidate is inapplicable to the supplied current context.');
  return { matches: true, proof: false };
}

function verifyBlob(world, hash, bytes) {
  if (!Buffer.isBuffer(bytes)) fail('blob bytes must be a Buffer.');
  const blob = uniqueBlobs(validateWorld(world).manifest).find((item) => item.hash === hash);
  if (!blob || blob.size !== bytes.length || sha256(bytes) !== hash) fail('blob is absent, corrupt or has a mismatched size.');
  return { hash, size: bytes.length };
}

module.exports = { validateWorld, qualifyWorld, qualifyCandidate, validateQualificationPolicy,
  environmentDigest, assertCurrentContext, uniqueBlobs, verifyBlob };
