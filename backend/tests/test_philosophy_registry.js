'use strict';

const assert = require('assert');
const m = require('../src/philosophy/conceptDefinitions');
const { validateRegistry, registryHealth } = require('../src/philosophy/conceptRegistry');

// ─── Structure tests ──────────────────────────────────────────────────────

assert.ok(Array.isArray(m.ALL_CONCEPTS), 'ALL_CONCEPTS must be an array');
assert.ok(m.ALL_CONCEPTS.length > 80, `Expected >80 concepts, got ${m.ALL_CONCEPTS.length}`);
assert.ok(Array.isArray(m.CORE_COMMITMENTS), 'CORE_COMMITMENTS must be an array');
assert.ok(Array.isArray(m.OPERATIONAL_THEORIES), 'OPERATIONAL_THEORIES must be an array');
assert.ok(Array.isArray(m.BIOMIMETIC_ANALOGIES), 'BIOMIMETIC_ANALOGIES must be an array');
assert.ok(Array.isArray(m.INTERPRETIVE_LENS), 'INTERPRETIVE_LENS must be an array');
assert.ok(Array.isArray(m.SPECULATIVE_HYPOTHESES), 'SPECULATIVE_HYPOTHESES must be an array');
assert.ok(Array.isArray(m.FILTERED_LEGACY), 'FILTERED_LEGACY must be an array');

console.log('✓ All category arrays exist');

// ─── Required fields on every concept ─────────────────────────────────────

const requiredFields = ['id', 'label', 'domain', 'school', 'status', 'role', 'runtimeAuthority', 'falsifiable', 'scope', 'knownLimits', 'historicalConfidence'];
for (const concept of m.ALL_CONCEPTS) {
  for (const field of requiredFields) {
    assert.ok(concept[field] !== undefined && concept[field] !== null,
      `${concept.id || 'unknown'} is missing required field: ${field}`);
  }
}
console.log(`✓ All ${m.ALL_CONCEPTS.length} concepts have required fields`);

// ─── Role validation ──────────────────────────────────────────────────────

const validRoles = new Set(['core', 'operational', 'analogy', 'lens', 'speculative']);
for (const concept of m.ALL_CONCEPTS) {
  assert.ok(validRoles.has(concept.role), `${concept.id} has invalid role: ${concept.role}`);
}
console.log('✓ All roles are valid enum values');

// ─── Core commitment invariants ───────────────────────────────────────────

for (const core of m.CORE_COMMITMENTS) {
  assert.strictEqual(core.role, 'core', `${core.id} must have role=core`);
  assert.strictEqual(core.runtimeAuthority, true, `${core.id} must have runtimeAuthority=true`);
  assert.strictEqual(core.falsifiable, true, `${core.id} must have falsifiable=true`);
  assert.strictEqual(core.historicalConfidence, 1.0, `${core.id} must have historicalConfidence=1.0`);
}
console.log(`✓ All ${m.CORE_COMMITMENTS.length} core commitments have correct invariants`);

// ─── Interpretive lens invariants ─────────────────────────────────────────

for (const lens of m.INTERPRETIVE_LENS) {
  assert.strictEqual(lens.role, 'lens', `${lens.id} must have role=lens`);
  assert.strictEqual(lens.runtimeAuthority, false, `${lens.id} must have runtimeAuthority=false`);
}
console.log(`✓ All ${m.INTERPRETIVE_LENS.length} interpretive lenses have runtimeAuthority=false`);

// ─── Speculative invariants ───────────────────────────────────────────────

for (const spec of m.SPECULATIVE_HYPOTHESES) {
  assert.strictEqual(spec.role, 'speculative', `${spec.id} must have role=speculative`);
  assert.strictEqual(spec.runtimeAuthority, false, `${spec.id} must have runtimeAuthority=false`);
  assert.ok(spec.historicalConfidence <= 0.5, `${spec.id} should have historicalConfidence <= 0.5`);
}
console.log(`✓ All ${m.SPECULATIVE_HYPOTHESES.length} speculative hypotheses have correct invariants`);

// ─── Historical confidence range ──────────────────────────────────────────

for (const concept of m.ALL_CONCEPTS) {
  assert.ok(concept.historicalConfidence >= 0 && concept.historicalConfidence <= 1,
    `${concept.id} has historicalConfidence out of range: ${concept.historicalConfidence}`);
}
console.log('✓ All historicalConfidence values in [0,1]');

// ─── No duplicate ids ────────────────────────────────────────────────────

const ids = m.ALL_CONCEPTS.map(c => c.id);
const uniqueIds = new Set(ids);
assert.strictEqual(ids.length, uniqueIds.size, `Found duplicate ids: ${ids.length - uniqueIds.size}`);
console.log(`✓ No duplicate ids (${ids.length} concepts, ${uniqueIds.size} unique)`);

// ─── knownLimits is array of strings ─────────────────────────────────────

for (const concept of m.ALL_CONCEPTS) {
  assert.ok(Array.isArray(concept.knownLimits), `${concept.id}.knownLimits must be an array`);
  for (const limit of concept.knownLimits) {
    assert.strictEqual(typeof limit, 'string', `${concept.id} knownLimit must be string: ${limit}`);
  }
}
console.log('✓ All knownLimits are string arrays');

// ─── Registry validation ─────────────────────────────────────────────────

const health = registryHealth();
assert.strictEqual(health.valid, true, `Registry invalid: ${JSON.stringify(health.errors)}`);
assert.strictEqual(health.errors.length, 0, `Registry has ${health.errors.length} errors`);
console.log(`✓ Registry valid: ${health.conceptCount} concepts, 0 errors`);

// ─── CONCEPT_DEFINITIONS alias ───────────────────────────────────────────

assert.ok(Array.isArray(m.CONCEPT_DEFINITIONS), 'CONCEPT_DEFINITIONS alias must be an array');
assert.strictEqual(m.CONCEPT_DEFINITIONS.length, m.ALL_CONCEPTS.length, 'CONCEPT_DEFINITIONS must equal ALL_CONCEPTS');
console.log('✓ CONCEPT_DEFINITIONS alias matches ALL_CONCEPTS');

// ─── deriveRole function ──────────────────────────────────────────────────

assert.strictEqual(m.deriveRole({ id: 'core.test' }), 'core', 'deriveRole should return core');
assert.strictEqual(m.deriveRole({ id: 'causality.test' }), 'operational', 'deriveRole should return operational');
assert.strictEqual(m.deriveRole({ id: 'biomimetic.test' }), 'analogy', 'deriveRole should return analogy');
assert.strictEqual(m.deriveRole({ id: 'lens.test' }), 'lens', 'deriveRole should return lens');
assert.strictEqual(m.deriveRole({ id: 'school.test' }), 'lens', 'deriveRole should return lens for schools');
assert.strictEqual(m.deriveRole({ id: 'random' }), 'speculative', 'deriveRole should default to speculative');
console.log('✓ deriveRole function works correctly');

// ─── deriveScope function ────────────────────────────────────────────────

assert.strictEqual(m.deriveScope('x', 'ontology'), 'ontological', 'deriveScope ontology');
assert.strictEqual(m.deriveScope('x', 'causality'), 'causal', 'deriveScope causality');
assert.strictEqual(m.deriveScope('x', 'epistemology'), 'epistemic', 'deriveScope epistemology');
assert.strictEqual(m.deriveScope('x', 'unknown'), 'general', 'deriveScope default');
console.log('✓ deriveScope function works correctly');

// ─── C() factory function ───────────────────────────────────────────────

const testConcept = m.C({
  id: 'test.concept',
  label: 'Test Concept',
  domain: 'epistemology',
  school: 'general',
  status: 'partial',
  role: 'operational',
});
assert.strictEqual(testConcept.id, 'test.concept');
assert.strictEqual(testConcept.role, 'operational');
assert.strictEqual(testConcept.runtimeAuthority, false, 'non-core should default to false');
assert.ok(Array.isArray(testConcept.knownLimits));
assert.ok(typeof testConcept.historicalConfidence === 'number');
console.log('✓ C() factory produces correct structure');

console.log('\n=== All philosophy registry tests passed ===');
