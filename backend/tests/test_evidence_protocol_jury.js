'use strict';

const assert = require('node:assert/strict');
const { BlindJury, commitmentFor } = require('../src/services/evidenceProtocol/jury');
const { digest } = require('../src/services/evidenceProtocol/canonical');

function participant(id, overrides = {}) {
  return {
    agentId: id, incarnationId: `incarnation:${id}`, executionId: `execution:${id}`,
    provenanceRoots: [`root:${id}`], methodId: `method:${id}`, dependsOn: [], ...overrides,
  };
}

function reveal(id, verdict = 'accept') {
  return { verifierId: id, verdict, nonce: `secret-nonce-${id}-${'x'.repeat(32)}` };
}

function commitAll(jury, values) {
  for (const value of values) {
    jury.commit({ verifierId: value.verifierId, commitment: commitmentFor(jury.descriptor(), value) });
  }
}

function complete(jury, values) {
  commitAll(jury, values);
  for (const value of values) jury.reveal(value);
  return jury.aggregate({ minSupportGroups: 2 });
}

function testBlindnessAndReplay() {
  const context = { artifactDigest: digest('patch'), predicate: 'isolated command exits 0' };
  const jury = new BlindJury({ juryId: 'round:1', context, participants: [participant('a'), participant('b')] });
  context.predicate = 'mutated by caller';
  assert.equal(jury.context().predicate, 'isolated command exits 0');
  const copy = jury.context();
  copy.predicate = 'mutated returned context';
  assert.equal(jury.context().predicate, 'isolated command exits 0');
  const a = reveal('a');
  const b = reveal('b');
  jury.commit({ verifierId: 'a', commitment: commitmentFor(jury.descriptor(), a) });
  assert.throws(() => jury.reveal(a), /Every jury commitment/);
  assert.throws(() => jury.aggregate({ minSupportGroups: 2 }), /All jury reveals/);
  assert.throws(() => jury.commit({ verifierId: 'a', commitment: digest('different') }), /Conflicting/);
  assert.throws(() => jury.commit({ verifierId: 'outsider', commitment: digest('x') }), /Unknown jury participant/);
  const resumed = BlindJury.restore(JSON.parse(JSON.stringify(jury.snapshot())));
  resumed.commit({ verifierId: 'b', commitment: commitmentFor(resumed.descriptor(), b) });
  assert.throws(() => resumed.reveal({ ...a, verdict: 'reject' }), /does not match/);
  assert.throws(() => resumed.reveal({ ...a, nonce: 'y'.repeat(40) }), /does not match/);
  resumed.reveal(a);
  resumed.reveal(a);
  const partiallyRevealed = BlindJury.restore(resumed.snapshot());
  assert.throws(() => partiallyRevealed.aggregate({ minSupportGroups: 2 }), /All jury reveals/);
  partiallyRevealed.reveal(b);
  assert.equal(partiallyRevealed.aggregate({ minSupportGroups: 2 }).verdict, 'supported');
  assert.equal(jury.snapshot().state.reveals.a, undefined);
  assert.throws(() => partiallyRevealed.aggregate(), /policy is required/);
  assert.throws(() => partiallyRevealed.aggregate({ minSupportGroups: 1, requireDifferentMethods: true }), /Only a positive/);
}

function testRoundBindingAndSnapshotIntegrity() {
  const options = { juryId: 'round:a', context: { artifact: 'a' }, participants: [participant('a')] };
  const jury = new BlindJury(options);
  const other = new BlindJury({ ...options, juryId: 'round:b' });
  const value = reveal('a');
  other.commit({ verifierId: 'a', commitment: commitmentFor(jury.descriptor(), value) });
  assert.throws(() => other.reveal(value), /does not match/);
  const changedContext = new BlindJury({ ...options, context: { artifact: 'b' } });
  changedContext.commit({ verifierId: 'a', commitment: commitmentFor(jury.descriptor(), value) });
  assert.throws(() => changedContext.reveal(value), /does not match/);
  const changedRoster = new BlindJury({ ...options, participants: [participant('a', { methodId: 'other' })] });
  changedRoster.commit({ verifierId: 'a', commitment: commitmentFor(jury.descriptor(), value) });
  assert.throws(() => changedRoster.reveal(value), /does not match/);
  complete(jury, [value]);
  const snapshot = jury.snapshot();
  snapshot.state.context.artifact = 'tampered';
  assert.throws(() => BlindJury.restore(snapshot), /snapshot digest mismatch/);
  snapshot.stateDigest = digest(snapshot.state);
  assert.throws(() => BlindJury.restore(snapshot), /context digest mismatch/);
  const forgedReveal = jury.snapshot();
  forgedReveal.state.reveals.a.verifierId = 'outsider';
  forgedReveal.stateDigest = digest(forgedReveal.state);
  assert.throws(() => BlindJury.restore(forgedReveal), /identity mismatch/);
  const wrongPhase = jury.snapshot();
  delete wrongPhase.state.commitments.a;
  wrongPhase.stateDigest = digest(wrongPhase.state);
  assert.throws(() => BlindJury.restore(wrongPhase), /Every jury commitment/);
}

function testCorrelatedContributions() {
  const clones = ['a', 'b', 'c', 'd', 'e'].map((id) => participant(id, { provenanceRoots: ['inherited:conclusion'] }));
  const jury = new BlindJury({ juryId: 'clones', context: {}, participants: clones });
  const result = complete(jury, clones.map((item) => reveal(item.agentId)));
  assert.equal(result.supportGroups, 1);
  assert.equal(result.verdict, 'not_supported');
  assert.equal(result.statisticalIndependence, 'not_established');
  const participants = [
    participant('a', { provenanceRoots: ['root:ab'], methodId: 'shared-method' }),
    participant('b', { provenanceRoots: ['root:ab', 'root:bc'] }),
    participant('c', { provenanceRoots: ['root:bc'] }),
    participant('d', { dependsOn: ['c'] }),
    participant('e', { executionId: 'execution:d' }),
    participant('f', { methodId: 'shared-method' }),
  ];
  const make = (roster) => new BlindJury({ juryId: 'transitive', context: {}, participants: roster });
  const forward = complete(make(participants), participants.map((item) => reveal(item.agentId)));
  const reverse = complete(make([...participants].reverse()), [...participants].reverse().map((item) => reveal(item.agentId)));
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.groups.map((group) => group.verifierIds), [['a', 'b', 'c', 'd', 'e'], ['f']]);
  assert.equal(forward.supportGroups, 2);
  assert.ok(forward.methodGroups.some((group) => group.join(',') === 'a,f'));
}

function testDissentAndBounds() {
  const participants = [participant('a', { provenanceRoots: ['shared'] }), participant('b', { provenanceRoots: ['shared'] })];
  const mixed = new BlindJury({ juryId: 'mixed', context: {}, participants });
  const result = complete(mixed, [reveal('a'), reveal('b', 'reject')]);
  assert.equal(result.unresolvedGroups, 1);
  assert.equal(result.supportGroups, 0);
  const rejected = new BlindJury({ juryId: 'reject', context: {}, participants: [participant('a')] });
  assert.equal(complete(rejected, [reveal('a', 'reject')]).rejectGroups, 1);
  assert.throws(() => new BlindJury({ juryId: 'large', context: 'é'.repeat(16), maxContextBytes: 30, participants }), /byte bound/);
  assert.throws(() => new BlindJury({ juryId: 'bad', context: {}, participants: [] }), /participants/);
  assert.throws(() => new BlindJury({ juryId: 'bad', context: {}, participants: [participant('a'), participant('a')] }), /Duplicate/);
  assert.throws(() => new BlindJury({ juryId: 'bad', context: {}, participants: [participant('a', { dependsOn: ['missing'] })] }), /dependency/);
  assert.throws(() => new BlindJury({ juryId: 'bad', context: {}, participants: [participant('__proto__')] }), /Reserved/);
  assert.throws(() => new BlindJury({ juryId: 'bad', context: {}, participants: [participant('a', { provenanceRoots: [] })] }), /provenance roots/);
  assert.throws(() => commitmentFor(rejected.descriptor(), { ...reveal('a'), nonce: 'short' }), /nonce/);
}

testBlindnessAndReplay();
testRoundBindingAndSnapshotIntegrity();
testCorrelatedContributions();
testDissentAndBounds();
console.log('EVIDENCE/JURY blind commitment, restart, context binding and dependency grouping passed.');
