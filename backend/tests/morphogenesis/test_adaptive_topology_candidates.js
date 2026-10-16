'use strict';

const assert = require('node:assert/strict');
const { generateAdaptiveTopologyCandidates } = require('../../src/services/morphogenesis/adaptiveTopologyCandidates');
const { createTopologyRegistry } = require('../../src/services/morphogenesis/registry/topologyRegistry');
const { parseExpression } = require('../../src/services/morphogenesis/expression/morphologyExpressionParser');
const { collectTopologies } = require('../../src/services/morphogenesis/expression/morphologyExpression');
const { createTopologyAdapterRegistry } = require('../../src/services/morphogenesis/adapters/topologyAdapterRegistry');

function run() {
  const registry = createTopologyRegistry();
  const input = { selectedTopology: 'a_team', selectedVariant: 'project_dag' };
  const firstResult = generateAdaptiveTopologyCandidates(input);
  const secondResult = generateAdaptiveTopologyCandidates(input);
  const first = firstResult.candidates;
  const second = secondResult.candidates;
  assert.equal(first[0].kind, 'NO_CHANGE');
  assert.equal(first[0].topology, 'a_team');
  assert.equal(first[0].variant, 'project_dag');
  const expectedVariants = registry.list().flatMap((topology) => registry.variants.listEntries(topology)
    .map((entry) => `${topology}:${entry.variantId}`));
  const actualVariants = first.filter((item) => item.kind === 'TOPOLOGY' || item.kind === 'VARIANT')
    .map((item) => `${item.topology}:${item.kind === 'TOPOLOGY' ? 'default' : item.variant}`);
  assert.deepEqual(actualVariants.sort(), expectedVariants.sort(), 'every registered topology variant is enumerated');
  assert.ok(first.length > 32, 'registered variants are not silently cut off by the former hard ceiling');
  assert.equal(firstResult.stats.candidateCount, first.length);
  assert.equal(firstResult.stats.variantCandidateCount + firstResult.stats.topologyCandidateCount,
    expectedVariants.length);
  assert.equal(firstResult.stats.registeredVariantCount, expectedVariants.length);
  assert.ok(firstResult.stats.compositePairsExamined <= firstResult.stats.compositePairCeiling);
  assert.ok(firstResult.stats.compositePairsPotential >= firstResult.stats.compositePairsExamined);
  assert.equal(firstResult.stats.compositePairsTruncated, firstResult.stats.compositePairsPotential > firstResult.stats.compositePairsExamined);
  assert.deepEqual(first.map((item) => item.candidateId), second.map((item) => item.candidateId));
  assert.deepEqual(first.map((item) => item.expression.expressionId), second.map((item) => item.expression.expressionId));
  assert.ok(first.some((item) => item.kind === 'TOPOLOGY'));
  assert.ok(first.some((item) => item.kind === 'VARIANT'));
  const nested = first.find((item) => item.kind === 'NESTED');
  assert.ok(nested, 'candidate set includes a composed topology recipe');
  assert.equal(nested.expression.kind, 'NEST');
  assert.equal(collectTopologies(nested.expression).length, 2);
  assertExecutableNest(first);

  for (const candidate of first) {
    if (!candidate.validation.valid) {
      assert.equal(candidate.admissibility, 'rejected', `${candidate.candidateId} remains visible as rejected`);
      assert.equal(candidate.executionEligible, false);
      assert.ok(candidate.admissibilityReason);
    }
    assert.equal(parseExpression(candidate.expression).kind, candidate.expression.kind);
    for (const leaf of collectTopologies(candidate.expression)) {
      assert.ok(registry.get(leaf.topology), `registered topology ${leaf.topology}`);
      if (leaf.variant) assert.ok(registry.variants.resolve(leaf.topology, leaf.variant), `registered variant ${leaf.topology}/${leaf.variant}`);
    }
  }

  const filteredResult = generateAdaptiveTopologyCandidates({ ...input, availableTopologyCapabilities: [] });
  const filtered = filteredResult.candidates;
  assert.equal(filtered[0].kind, 'NO_CHANGE');
  const filteredVariants = filtered.filter((item) => item.kind === 'TOPOLOGY' || item.kind === 'VARIANT')
    .map((item) => `${item.topology}:${item.kind === 'TOPOLOGY' ? 'default' : item.variant}`);
  assert.deepEqual(filteredVariants.sort(), expectedVariants.sort(), 'capability filtering keeps every variant visible');
  const capabilityVetoes = filtered.filter((item) => item.missingCapabilities?.length);
  assert.ok(capabilityVetoes.length > 0);
  assert.ok(capabilityVetoes.every((item) => item.admissibility === 'rejected'
    && item.executionEligible === false && item.admissibilityReason));
  assert.equal(filteredResult.stats.vetoedCandidateCount,
    filtered.filter((item) => item.admissibility === 'rejected').length);
  assertUnverifiedCompositionsStayExploratory(registry);
  assertVerifiedCompositionsRequireVerifiedAdapter(registry);
  console.log('Adaptive topology candidates: PASS');
}

function assertExecutableNest(candidates) {
  const executable = candidates.filter((item) => item.kind === 'NESTED' && item.executionEligible);
  assert.ok(executable.some((item) => item.members[0].topology === 'a_team'
    && item.members[1].topology === 'trinity'),
  'a verified Trinity-to-A-Team adapter makes at least one NEST executable');
}

function assertUnverifiedCompositionsStayExploratory(registry) {
  const conceptual = restrictedRegistry(registry, ['biocenose', 'holobionte']);
  const conceptualNest = findNested({ registry: conceptual, host: 'biocenose', inner: 'holobionte' });
  assert.equal(conceptualNest.relation.evidenceStatus, 'conceptual');
  assert.equal(conceptualNest.admissibility, 'exploratory_only');
  assert.equal(conceptualNest.executionEligible, false);

  const unspecified = restrictedRegistry(registry, ['biome', 'trinity']);
  const unspecifiedNest = findNested({ registry: unspecified, host: 'biome', inner: 'trinity' });
  assert.equal(unspecifiedNest.relation.relation, 'UNSPECIFIED');
  assert.equal(unspecifiedNest.admissibility, 'exploratory_only');
  assert.equal(unspecifiedNest.executionEligible, false);
}

function assertVerifiedCompositionsRequireVerifiedAdapter(registry) {
  const pair = restrictedRegistry(registry, ['a_team', 'trinity']);
  const missing = findNested({ registry: pair, host: 'a_team', inner: 'trinity',
    adapterRegistry: createTopologyAdapterRegistry() });
  assert.equal(missing.admissibility, 'exploratory_only');
  assert.equal(missing.executionEligible, false);

  const adapters = createTopologyAdapterRegistry();
  adapters.register({ id: 'verified-a-team-adapter', version: '1.0.0', fromTopology: 'trinity', toTopology: 'a_team', evidenceStatus: 'verified', adapt: (value) => value });
  const eligible = findNested({ registry: pair, host: 'a_team', inner: 'trinity', adapterRegistry: adapters });
  assert.equal(eligible.relation.evidenceStatus, 'verified');
  assert.equal(eligible.admissibility, 'execution_eligible');
  assert.equal(eligible.executionEligible, true);
}

function restrictedRegistry(registry, topologyIds) {
  return {
    list: () => topologyIds,
    get: (topology) => registry.get(topology),
    variants: { listEntries: (topology) => registry.variants.listEntries(topology).filter((entry) => entry.variantId === 'default') },
    relations: registry.relations
  };
}

function findNested(input) {
  const { registry, host, inner } = input;
  const candidates = generateAdaptiveTopologyCandidates({ ...input, selectedTopology: host }).candidates;
  const result = candidates.find((item) => item.kind === 'NESTED'
    && item.members[0].topology === host && item.members[0].variant === 'default'
    && item.members[1].topology === inner && item.members[1].variant === 'default');
  assert.ok(result, `nested candidate ${host} -> ${inner} exists`);
  return result;
}

run();
