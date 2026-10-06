'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const contracts = require('../src/services/trinityQualificationContract');
const semantics = require('../src/services/trinityQualificationSemantics');

function input() {
  return { originalMission: 'Évalue les variantes sans remplacer la mission.\r\n文字 😀',
    requirements: [{ id: 'r1', text: 'Index exact sur la fixture.', kind: 'semantic', scope: 'fixture', verificationRefs: ['v1'] }],
    fixtures: [{ id: 'f1', description: 'Entrée bornée, pas une preuve universelle.',
      input: { values: [2, 4, 9], target: 4, missing: null, enabled: false, offset: 0, space: ' ' },
      limitations: ['Cette fixture ne mesure pas la complexité.'], requirementIds: ['r1'] }],
    verificationRefs: [{ id: 'v1', verifierId: 'isolated-index-check', verifierVersion: '1.0',
      verifierDigest: contracts.hashText('index-check-code-v1'), scope: 'fixture', requirementIds: ['r1'], fixtureIds: ['f1'] }],
    scope: { kind: 'fixture', limitations: ['La mission originale dépasse cette fixture.'] },
    privateOracle: { expectedIndex: 1, holdoutSecret: 'PRIVATE_ONLY_4758' } };
}

function signature(receipt) {
  return crypto.createHmac('sha256', 'unit-test-only-trust-key').update(contracts.hash(receipt)).digest('hex');
}

function signed(receipt) {
  return { ...receipt, signature: signature(receipt) };
}

function testAuthenticator(receipt) {
  const { signature: actual, ...body } = receipt;
  return actual === signature(body);
}

function receipt(contract, candidate) {
  const ref = contract.verificationRefs[0];
  return { verificationRefId: ref.id, status: 'verified', independent: true,
    contractHash: contract.hash, candidateHash: contracts.hash(candidate),
    verifierId: ref.verifierId, verifierVersion: ref.verifierVersion, verifierDigest: ref.verifierDigest,
    scope: ref.scope, requirementIds: ['r1'], fixtureIds: ['f1'], method: 'bounded_execution',
    independenceDescriptor: { actorId: 'unit-verifier', workspaceId: 'unit-isolated' } };
}

function context(receipts) {
  return { receipts, producer: { actorId: 'unit-producer', workspaceId: 'unit-producer-workspace' },
    verifyReceipt: testAuthenticator };
}

test('public contract preserves exact UTF8 text and separates private oracle by structure', () => {
  const source = input();
  const sealed = contracts.create(source);
  const publicText = contracts.promptInstruction(sealed.publicContract);
  assert.equal(sealed.publicContract.originalMission.text, source.originalMission);
  assert.equal(sealed.publicContract.originalMission.sha256, contracts.hashText(source.originalMission));
  assert.equal(sealed.publicContract.oracleCommitment, contracts.hash({ nonce: sealed.privateOracleNonce, oracle: source.privateOracle }));
  assert.notEqual(sealed.publicContract.oracleCommitment, contracts.hash(source.privateOracle));
  assert.equal(publicText.includes(sealed.privateOracleNonce), false);
  assert.equal(publicText.includes('PRIVATE_ONLY_4758'), false);
  assert.equal(publicText.includes('expectedIndex'), false);
  assert.equal(Object.hasOwn(sealed.publicContract, 'privateOracle'), false);
  assert.deepEqual(sealed.publicContract.fixtures[0].input, source.fixtures[0].input);
  source.fixtures[0].input.values[0] = 200;
  assert.equal(sealed.publicContract.fixtures[0].input.values[0], 2);
  assert.throws(() => { sealed.publicContract.originalMission.text = 'edited'; }, TypeError);
  assert.throws(() => contracts.publicProjection(sealed));
});

test('projection rejects injected oracle channels instead of redacting names in prompt text', () => {
  const contract = contracts.create(input()).publicContract;
  assert.throws(() => contracts.publicProjection({ ...contract, oracle: { answer: 1 } }));
  const source = input();
  source.fixtures[0].expected = 1;
  assert.throws(() => contracts.create(source));
  delete source.fixtures[0].expected;
  source.requirements[0].privateOracle = { answer: 1 };
  assert.throws(() => contracts.create(source));
});

test('stable versioned hashes reject modification and externally anchored mission replacement', () => {
  const contract = contracts.create(input()).publicContract;
  assert.equal(contracts.validate(contract).qualified, true);
  assert.deepEqual(contracts.publicProjection(JSON.parse(JSON.stringify(contract))), contract);
  assert.equal(contracts.validate({ ...contract, version: 2 }).valid, false);
  const edited = JSON.parse(JSON.stringify(contract));
  edited.fixtures[0].input.target = 9;
  assert.equal(contracts.validate(edited).valid, false);
  const other = input();
  other.originalMission += '\nEnriched task';
  assert.equal(contracts.validate(contracts.create(other).publicContract,
    { expectedOriginalHash: contract.originalMission.sha256 }).valid, false);
  assert.equal(contracts.hash({ b: false, a: 0 }), contracts.hash({ a: 0, b: false }));
});

test('legacy compatibility is not qualification and unknown versions fail closed', () => {
  assert.deepEqual(contracts.validate({ domain: 'software_engineering', artifact: 'technical' }),
    { valid: true, qualified: false, legacy: true, errors: ['legacy_contract_not_qualified'] });
  assert.equal(contracts.verify({ domain: 'legacy' }, { tests: 'PASS' }).accepted, false);
  assert.equal(contracts.validate({ schema: 'future-contract/v2', version: 2 }).valid, false);
  assert.equal(contracts.validate(null).valid, false);
});

test('JSON fidelity rejects nonfinite, undefined, accessors, invalid Unicode and missing references', () => {
  const nonfinite = input();
  nonfinite.fixtures[0].input.target = NaN;
  assert.throws(() => contracts.create(nonfinite));
  const undefinedValue = input();
  undefinedValue.fixtures[0].input.target = undefined;
  assert.throws(() => contracts.create(undefinedValue));
  const accessor = input();
  Object.defineProperty(accessor, 'privateOracle', { get: () => { throw new Error('Getter must not run'); }, enumerable: true });
  assert.throws(() => contracts.create(accessor), /accessors/);
  const badText = input();
  badText.originalMission = 'invalid\uD800';
  assert.throws(() => contracts.create(badText), /surrogate/);
  const missingRef = input();
  missingRef.requirements[0].verificationRefs = ['absent'];
  assert.throws(() => contracts.create(missingRef), /Unresolved/);
});

test('arrays cannot silently drop sparse entries, hidden oracles or invoke accessor payloads', () => {
  const sparse = input();
  sparse.fixtures[0].input.values = new Array(1);
  assert.throws(() => contracts.create(sparse), /dense/);
  const accessor = input();
  Object.defineProperty(accessor.fixtures[0].input.values, '0', { get: () => { throw new Error('Do not invoke'); } });
  assert.throws(() => contracts.create(accessor), /accessors/);
  const extra = input();
  extra.fixtures[0].input.values.privateOracle = 'PRIVATE';
  assert.throws(() => contracts.create(extra), /extra fields/);
});

test('a candidate PASS assertion or unsigned receipt cannot become an accepted result', () => {
  const contract = contracts.create(input()).publicContract;
  const candidate = { index: 1, passed: true, coverage: 1, status: 'accepted' };
  assert.equal(contracts.verify(contract, candidate).accepted, false);
  const raw = receipt(contract, candidate);
  assert.equal(contracts.verify(contract, candidate, context([raw])).accepted, false);
  const accepted = contracts.verify(contract, candidate, context([signed(raw)]));
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.missionVerified, false);
  assert.equal(accepted.coverage, null);
  assert.equal(accepted.promotionAuthorized, false);
});

test('trust does not override wrong candidate, source identity, coverage or ambiguous receipts', () => {
  const contract = contracts.create(input()).publicContract;
  const candidate = { index: 1 };
  const raw = receipt(contract, candidate);
  const mutations = [
    { candidateHash: contracts.hash({ index: 0 }) }, { contractHash: contracts.hashText('another contract') },
    { verifierVersion: '2.0' }, { verifierId: 'other' }, { verifierDigest: contracts.hashText('other') },
    { requirementIds: [] }, { fixtureIds: [] }, { independent: false },
    { independenceDescriptor: { actorId: 'unit-producer', workspaceId: 'unit-isolated' } },
    { independenceDescriptor: { actorId: 'unit-verifier', workspaceId: 'unit-producer-workspace' } }
  ];
  mutations.forEach(change => assert.equal(contracts.verify(contract, candidate,
    context([signed({ ...raw, ...change })])).accepted, false));
  const valid = signed(raw);
  assert.equal(contracts.verify(contract, candidate, context([valid, valid])).accepted, false);
  assert.equal(contracts.verify(contract, candidate, { ...context([valid]), verifyReceipt: async () => true }).accepted, false);
});

test('bounded trials cannot certify a universal requirement even with an authenticated receipt', () => {
  const source = input();
  source.requirements[0].kind = 'proof';
  source.requirements[0].scope = 'universal';
  source.verificationRefs[0].scope = 'universal';
  source.scope = { kind: 'mission', limitations: [] };
  const contract = contracts.create(source).publicContract;
  const candidate = { claim: 'All integers satisfy the theorem', trialsPassed: 100000 };
  const raw = receipt(contract, candidate);
  const rejected = contracts.verify(contract, candidate, context([signed(raw)]));
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.reasons.includes('trials_are_not_a_proof'));
  assert.equal(contracts.verify(contract, candidate,
    context([signed({ ...raw, method: 'exhaustive_finite' })])).accepted, false);
  assert.equal(contracts.verify(contract, candidate,
    context([signed({ ...raw, method: 'formal_proof' })])).accepted, true);
});

test('a bounded requirement inside mission scope cannot assert whole mission verification', () => {
  const source = input();
  source.scope = { kind: 'mission', limitations: [] };
  const contract = contracts.create(source).publicContract;
  const candidate = { index: 1 };
  const checked = contracts.verify(contract, candidate, context([signed(receipt(contract, candidate))]));
  assert.equal(checked.accepted, true);
  assert.equal(checked.missionVerified, false);
});

test('Pareto requires no worsening in all explicit dimensions and one strict improvement', () => {
  const base = { dimensions: [{ id: 'quality', direction: 'max' }, { id: 'cost', direction: 'min' }],
    left: { quality: 9, cost: 3 }, right: { quality: 8, cost: 4 }, claimedDominates: true };
  assert.equal(semantics.verify('pareto', base).verified, true);
  assert.equal(semantics.verify('pareto', { ...base, left: { quality: 9, cost: 5 } }).verified, false);
  assert.equal(semantics.verify('pareto', { ...base, left: base.right }).verified, false);
  assert.equal(semantics.verify('pareto', { ...base, left: { quality: 9 } }).verified, false);
  assert.equal(semantics.verify('pareto', { ...base, dimensions: [] }).verified, false);
});

test('binary search checks index validity rather than mere presence of target', () => {
  const base = { values: [1, 3, 3, 7], target: 3, index: 1 };
  assert.equal(semantics.verify('binary_search', base).verified, true);
  assert.equal(semantics.verify('binary_search', { ...base, index: 2, duplicatePolicy: 'first' }).verified, false);
  assert.equal(semantics.verify('binary_search', { ...base, index: 3 }).verified, false);
  assert.equal(semantics.verify('binary_search', { ...base, index: -1 }).verified, false);
  assert.equal(semantics.verify('binary_search', { ...base, target: 99, index: -1 }).verified, true);
  assert.equal(semantics.verify('binary_search', { ...base, target: 99, index: 1 }).verified, false);
  assert.equal(semantics.verify('binary_search', { ...base, values: [3, 1] }).verified, false);
});

test('exploration restrictions reject mutating or unobserved actions and disguised extra fields', () => {
  const base = { policy: { allowedActions: ['menu', 'navigation', 'search'], requiredActions: ['search'], forbiddenMechanisms: [], maxSteps: 3 },
    actions: [{ kind: 'menu', mechanism: 'menu', target: 'Documentation' }, { kind: 'search', mechanism: 'search', query: 'Trinity' }] };
  assert.equal(semantics.verify('exploration', base).verified, true);
  assert.equal(semantics.verify('exploration', { ...base, actions: [] }).verified, false);
  assert.equal(semantics.verify('exploration', { ...base, actions: [{ kind: 'menu', target: 'Docs' }] }).verified, false);
  assert.equal(semantics.verify('exploration', { ...base, actions: [{ kind: 'purchase', target: 'Subscription' }] }).verified, false);
  assert.equal(semantics.verify('exploration', { ...base, actions: [{ kind: 'navigation', target: 'Docs', operation: 'delete' }] }).verified, false);
  assert.equal(semantics.verify('exploration', { ...base, policy: { ...base.policy, maxSteps: 1 } }).verified, false);
});

test('exploration forbids menus, navigation bars and search while allowing genuine gesture declarations', () => {
  const policy = { allowedActions: ['gesture', 'navigation', 'search'], requiredActions: [],
    forbiddenMechanisms: ['menu', 'navigation_bar', 'search'], maxSteps: 4 };
  const rejected = semantics.verify('exploration', { policy, actions: [
    { kind: 'navigation', mechanism: 'tabs', target: 'Section 2' },
    { kind: 'navigation', mechanism: 'tree', target: 'Section 3' },
    { kind: 'search', mechanism: 'search', query: 'Other section' }
  ] });
  assert.equal(rejected.verified, false);
  assert.deepEqual(rejected.invalidIndexes, [0, 1, 2]);
  const conforming = semantics.verify('exploration', { policy, actions: [
    { kind: 'gesture', mechanism: 'gesture', target: 'Drag current canvas' },
    { kind: 'navigation', mechanism: 'gesture', target: 'Swipe through document' }
  ] });
  assert.equal(conforming.verified, true);
  assert.equal(conforming.executionVerified, false);
  assert.equal(conforming.traceAuthenticity, 'unverified');
  assert.equal(semantics.verify('exploration', { policy, actions: [{ kind: 'gesture', target: 'Missing mechanism' }] }).verified, false);
});
