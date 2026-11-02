'use strict';

const assert = require('node:assert/strict');
const nativeManifest = require('../src/services/gqwf/manifest');
const nativeClosure = require('../src/services/gqwf/executionClosure');
const metadata = require('../src/services/gqwf/metadataStore');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { validateWorld, qualifyWorld, qualifyCandidate, environmentDigest, assertCurrentContext, verifyBlob } = require('../src/services/gqwfExchange/qualification');
const fixture = require('./helpers/gqwfExchangeContractFixture');

function closureTampering() {
  const world = fixture.world();
  world.closure.assurance.sandbox = 'attested';
  assert.equal(nativeClosure.buildManifest(world.closure).assurance.sandbox, 'not-attested');
  world.closureSerialized = JSON.stringify(world.closure);
  world.closureHash = metadata.digest(world.closureSerialized);
  assert.throws(() => validateWorld(world), /contract|closure/);
  const protocol = fixture.world(); protocol.closure.protocol = 'claimed-stronger-protocol';
  assert.equal(nativeClosure.buildManifest(protocol.closure).protocol, 'gqwf-execution-closure-v1');
  assert.throws(() => validateWorld(protocol), /contract|closure/);
  const raw = fixture.world(); raw.closureSerialized += '\n'; raw.closureHash = metadata.digest(raw.closureSerialized);
  assert.throws(() => validateWorld(raw), /raw serialization/);
  const changed = fixture.world(); changed.closure.runtime.digest = 'f'.repeat(64);
  assert.throws(() => validateWorld(changed), /raw serialization/);
}

function manifestTampering() {
  const traversal = fixture.world(); traversal.manifest.files[0].path = '../counter.json';
  assert.throws(() => validateWorld(traversal), /path|relative|portable/i);
  const raw = fixture.world(); raw.manifestSerialized += '\n';
  assert.throws(() => validateWorld(raw), /native canonical/);
  const root = fixture.world({ rootHash: 'f'.repeat(64) });
  assert.throws(() => validateWorld(root), /root/);
  const conflict = fixture.world();
  conflict.manifest.files.push({ ...conflict.manifest.files[0], path: 'other.json', size: 1 });
  const rebuilt = nativeManifest.createManifest(conflict.manifest.files);
  conflict.manifest = rebuilt.manifest; conflict.manifestSerialized = rebuilt.serialized; conflict.rootHash = rebuilt.hash;
  assert.throws(() => validateWorld(conflict), /conflicting sizes/);
}

function candidateBindings() {
  const world = fixture.world();
  const candidate = fixture.candidate();
  const fields = ['worldId', 'worldDigest', 'rootHash', 'closureHash', 'environmentDigest'];
  for (const field of fields) {
    const value = field === 'worldId' ? 'other' : field.endsWith('Hash') ? 'f'.repeat(64) : digest('other');
    assert.throws(() => qualifyCandidate(world, { ...candidate, [field]: value }, fixture.policy()), /binding mismatch/);
  }
  assert.throws(() => qualifyCandidate(world, fixture.candidate({ predicate: { command: { executable: 'node', arguments: ['other.js'] }, expectedExitCode: 0 } }), fixture.policy()), /predicate command/);
  assert.throws(() => qualifyCandidate(world, candidate, fixture.policy({ version: '2' })), /policy reference/);
  assert.throws(() => qualifyCandidate(world, candidate, fixture.policy({ allowedOrigins: ['observed'] })), /origin/);
  assert.throws(() => qualifyCandidate(world, candidate, fixture.policy({ verifierRefs: [] })), /contract/);
}

function originPreservation() {
  for (const kind of ['observed', 'isolated', 'simulated', 'unexecuted']) {
    const world = fixture.world({ origin: { kind, sourceRef: 'explicit-origin' } });
    const candidate = fixture.candidate({ worldDigest: digest(world) });
    const qualified = qualifyCandidate(world, candidate, fixture.policy({ allowedOrigins: [kind] }));
    assert.equal(qualified.origin.kind, kind);
    assert.equal(qualified.assurance.externalInputs, 'declared-only');
    assert.equal(qualified.assurance.sandbox, 'not-attested');
    assert.equal(qualified.actionAuthorized, false);
    assert.equal(qualified.qualificationLevel, 'descriptor-integrity');
  }
}

function freshContextIsNotProof() {
  const candidate = fixture.candidate();
  const current = { rootHash: candidate.baseHash, generation: candidate.baseGeneration,
    environmentDigest: candidate.environmentDigest, policy: candidate.policy };
  assert.deepEqual(assertCurrentContext(candidate, current), { matches: true, proof: false });
  assert.throws(() => assertCurrentContext(candidate, { ...current, generation: 1 }), /inapplicable/);
  assert.throws(() => assertCurrentContext(candidate, { ...current, rootHash: 'f'.repeat(64) }), /inapplicable/);
  assert.throws(() => assertCurrentContext(candidate, { ...current, environmentDigest: digest('other') }), /inapplicable/);
}

const world = fixture.world();
assert.deepEqual(validateWorld(world), world);
assert.equal(qualifyWorld(world).worldDigest, digest(world));
assert.equal(qualifyWorld(world).environmentDigest, environmentDigest(world));
const file = world.manifest.files[0];
assert.deepEqual(verifyBlob(world, file.hash, fixture.bytes()), { hash: file.hash, size: fixture.bytes().length });
assert.throws(() => verifyBlob(world, file.hash, Buffer.from('changed')), /corrupt/);
assert.throws(() => verifyBlob(world, 'f'.repeat(64), fixture.bytes()), /absent/);
closureTampering();
manifestTampering();
candidateBindings();
originPreservation();
freshContextIsNotProof();
console.log('GQWF native world/closure qualification, unchanged origins and exact evidence applicability: PASS');
