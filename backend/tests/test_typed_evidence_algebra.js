'use strict';

const assert = require('assert');
const algebra = require('../src/services/typedEvidenceAlgebraService');

// ─── createEvidenceProfile ────────────────────────────────────────────────

const formal = algebra.createEvidenceProfile({
  type: 'formal',
  source: 'lean4',
  properties: { proof: 'completed', falsifiability: true, mathematical_certainty: 'high' },
});
assert.strictEqual(formal.type, 'formal');
assert.strictEqual(formal.source, 'lean4');
assert.ok(Array.isArray(formal.knownLimits));
assert.strictEqual(formal.executable, false);
assert.strictEqual(formal.runtimeAuthority, false);
console.log('✓ createEvidenceProfile: formal evidence');

const causal = algebra.createEvidenceProfile({
  type: 'causal',
  source: 'fork_replay',
  properties: { intervention_documented: true, causal_graph: 'SCM-001' },
});
assert.strictEqual(causal.type, 'causal');
console.log('✓ createEvidenceProfile: causal evidence');

// Invalid type throws
assert.throws(
  () => algebra.createEvidenceProfile({ type: 'unknown' }),
  /unknown type/
);
console.log('✓ createEvidenceProfile: rejects invalid type');

// ─── assessIndependence ──────────────────────────────────────────────────

// Same LLM, same method → not independent
const ev1 = algebra.createEvidenceProfile({ type: 'observational', source: 'llm-claude', properties: { method: 'direct' } });
const ev2 = algebra.createEvidenceProfile({ type: 'observational', source: 'llm-claude', properties: { method: 'direct' } });
const ind1 = algebra.assessIndependence(ev1, ev2);
assert.strictEqual(ind1.independent, false, 'Same source+type+method must not be independent');
console.log('✓ assessIndependence: same source+type+method → not independent');

// Same source, different method → partial
const ev3 = algebra.createEvidenceProfile({ type: 'observational', source: 'llm-claude', properties: { method: 'chain-of-thought' } });
const ind2 = algebra.assessIndependence(ev1, ev3);
assert.strictEqual(ind2.independent, 'partial', 'Same source, different method → partial');
console.log('✓ assessIndependence: same source, different method → partial');

// Different sources → likely independent
const ev4 = algebra.createEvidenceProfile({ type: 'observational', source: 'human-expert' });
const ev5 = algebra.createEvidenceProfile({ type: 'observational', source: 'automated-test' });
const ind3 = algebra.assessIndependence(ev4, ev5);
assert.strictEqual(ind3.independent, true, 'Different sources → likely independent');
console.log('✓ assessIndependence: different sources → likely independent');

// ─── compareEvidenceStrength ──────────────────────────────────────────────

// Same type → comparable
const cmp1 = algebra.compareEvidenceStrength(
  algebra.createEvidenceProfile({ type: 'formal', source: 'lean4' }),
  algebra.createEvidenceProfile({ type: 'formal', source: 'coq' })
);
assert.strictEqual(cmp1.comparable, true, 'Same type should be comparable');
console.log('✓ compareEvidenceStrength: same type → comparable');

// Different types → incommensurable
const cmp2 = algebra.compareEvidenceStrength(
  algebra.createEvidenceProfile({ type: 'formal', source: 'lean4' }),
  algebra.createEvidenceProfile({ type: 'causal', source: 'replay' })
);
assert.strictEqual(cmp2.comparable, false, 'Different types should be incommensurable');
console.log('✓ compareEvidenceStrength: different types → incommensurable');

// ─── evidenceReport ──────────────────────────────────────────────────────

const report = algebra.evidenceReport({
  claims: ['Agent A completed task X'],
  evidence: [
    { type: 'observational', source: 'telemetry', properties: { recency: '2026-09-22' } },
    { type: 'formal', source: 'lean4', properties: { proof: 'completed' } },
    { type: 'adversarial', source: 'fuzzer', properties: { challenge_success_rate: 0.95 } },
  ],
  dependencies: [],
});
assert.strictEqual(report.evidence.length, 3);
assert.strictEqual(report.assessment.distinctTypes.length, 3);
assert.strictEqual(report.independenceMap.length, 3); // 3 choose 2 = 3 pairs
assert.strictEqual(report.executable, false);
console.log('✓ evidenceReport: 3 evidence types, 3 independence pairs');

// ─── Two proofs from same LLM are NOT independent ────────────────────────

const llmProof1 = algebra.createEvidenceProfile({
  type: 'formal',
  source: 'llm-gpt4',
  properties: { method: 'auto-formalization' },
});
const llmProof2 = algebra.createEvidenceProfile({
  type: 'formal',
  source: 'llm-gpt4',
  properties: { method: 'auto-formalization' },
});
const llmInd = algebra.assessIndependence(llmProof1, llmProof2);
assert.strictEqual(llmInd.independent, false, 'Two proofs from same LLM with same method must NOT be independent');
console.log('✓ Two proofs from same LLM are NOT independent');

// ─── EVIDENCE_TYPES completeness ──────────────────────────────────────────

assert.ok(Array.isArray(algebra.EVIDENCE_TYPES));
assert.ok(algebra.EVIDENCE_TYPES.includes('observational'));
assert.ok(algebra.EVIDENCE_TYPES.includes('formal'));
assert.ok(algebra.EVIDENCE_TYPES.includes('causal'));
assert.ok(algebra.EVIDENCE_TYPES.includes('testimonial'));
assert.ok(algebra.EVIDENCE_TYPES.includes('replicated'));
assert.ok(algebra.EVIDENCE_TYPES.includes('adversarial'));
assert.ok(algebra.EVIDENCE_TYPES.includes('human_authoritative'));
console.log('✓ All 8 evidence types defined');

console.log('\n=== All typed evidence algebra tests passed ===');
