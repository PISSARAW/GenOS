'use strict';

const assert = require('assert');
const manifestService = require('../src/services/adapterEcology/adapterManifest');

function fixture(overrides = {}) {
  return {
    schema: manifestService.SCHEMA, adapterId: 'github-code-search', version: '1.2.0',
    providerKind: 'service', reference: 'provider://github/code-search',
    capabilities: ['code.search', 'repository.read'], dataScopes: ['repo:alpha'],
    toolLeases: ['github.search'], economics: { costUsd: 0.02, latencyMs: 140 },
    health: { status: 'HEALTHY', checkedAt: '2026-10-19T10:00:00.000Z', reliability: 0.98 },
    fitness: { evidenceQuality: 0.9, historicalCompatibility: 0.8, replaceability: 0.7,
      risk: 0.1, dependencyRisk: 0.2 },
    attestationRefs: ['attestation:github:sha256:abc'],
    compensation: { action: 'github.detach', evidenceRequirements: ['receipt:detached'] },
    ...overrides
  };
}

function testNormalizeAndProject() {
  const normalized = manifestService.normalizeManifest(fixture());
  assert.strictEqual(normalized.adapterId, 'github-code-search');
  assert.ok(Object.isFrozen(normalized));
  const node = manifestService.toCapabilityNode(normalized);
  assert.strictEqual(node.kind, 'EXTERNAL_SERVICE');
  assert.strictEqual(node.state, 'AVAILABLE');
  assert.strictEqual(node.providers[0].providerId, 'github-code-search');
  assert.deepStrictEqual(node.provenance, normalized.attestationRefs);
}

function testHolobiontProjection() {
  const constitution = { hostId: 'host-cursor', maxDependencyPerSymbiont: 0.6,
    privacyPolicy: { restricted: ['secrets'] } };
  const contract = manifestService.toSymbiosisContract(fixture(), constitution);
  assert.strictEqual(contract.symbiontId, 'github-code-search');
  assert.deepStrictEqual(contract.toolLeases, ['github.search']);
  assert.strictEqual(contract.transmissionPolicy, 'REACQUIRE_EACH_GENERATION');
  assert.deepStrictEqual(contract.adaptationPolicy.compensation.evidenceRequirements, ['receipt:detached']);
}

function testFailClosedAuthorityAndEvidence() {
  assert.throws(() => manifestService.normalizeManifest(fixture({ toolLeases: ['*'] })), {
    code: 'ADAPTER_SYMBIONT_SCOPE_INVALID'
  });
  assert.throws(() => manifestService.normalizeManifest(fixture({ attestationRefs: [] })), {
    code: 'ADAPTER_SYMBIONT_MANIFEST_INVALID'
  });
  assert.throws(() => manifestService.normalizeManifest(fixture({
    health: { status: 'HEALTHY', checkedAt: 'invalid', reliability: 1 }
  })), { code: 'ADAPTER_SYMBIONT_MANIFEST_INVALID' });
}

testNormalizeAndProject();
testHolobiontProjection();
testFailClosedAuthorityAndEvidence();
console.log('Adapter symbiont manifest tests passed.');
