'use strict';

const assert = require('assert');
const m = require('../src/philosophy/conceptDefinitions');
const stoicism = require('../src/services/stoicismService');
const epicurean = require('../src/services/epicureanService');
const algebra = require('../src/services/typedEvidenceAlgebraService');

// ─── Falsification tests — un mapping doit pouvoir échouer ───────────────

// 1. Test de falsification : isMonist() ne doit JAMAIS retourner monist:true en dur
const monistResult = stoicism.monistLens({ agent: { id: 'A1', rationality: 0.1 } });
assert.ok(
  monistResult.assessment && monistResult.assessment.type !== 'hardcoded-verdict',
  'monistLens must NOT return hardcoded verdict'
);
assert.strictEqual(monistResult.executable, false);
assert.strictEqual(monistResult.runtimeAuthority, false);
console.log('✓ Falsification 1: monistLens is a lens, not a hardcoded verdict');

// 2. Test de falsification : atomSchema ne doit JAMAIS créer 3 types d'atomes
const atomResult = epicurean.atomLens({ agent: { id: 'B1' } });
assert.ok(
  !atomResult.atoms.corps || !atomResult.atoms.âme || atomResult.atoms.composedOfAtoms,
  'atomLens must NOT create 3 separate atom types'
);
assert.ok(
  atomResult.atoms.composedOfAtoms && atomResult.atoms.composedOfAtoms.includes('âme'),
  'atomLens should state that soul IS composed of atoms'
);
assert.strictEqual(atomResult.executable, false);
assert.strictEqual(atomResult.runtimeAuthority, false);
console.log('✓ Falsification 2: atomLens does not create 3 atom types');

// 3. Test de falsification : fateAcceptation ne doit PAS conclure "fully_accepted" sur status
const fate = stoicism.fateAcceptation({ agent: { id: 'C1', status: 'failed' } });
assert.ok(
  !fate.acceptance || fate.acceptance !== 'fully_accepted',
  'fateAcceptation should not conclude "fully_accepted" on status alone'
);
assert.ok(
  fate.assessment && fate.assessment.type,
  'fateAcceptation should produce an assessment with type'
);
console.log('✓ Falsification 3: fateAcceptation does not infer acceptance from status');

// 4. Test de falsification : ataraxieAnalysis ne doit pas conclure "true ataraxie" sur seuil
const ataraxie = epicurean.ataraxieAnalysis({ agent: { id: 'D1', tranquility: 0.9 } });
assert.ok(
  !ataraxie.assessment.note.includes('a atteint') || ataraxie.assessment.type !== 'verdict',
  'ataraxieAnalysis should not claim "reached ataraxie" as verdict'
);
assert.ok(
  ataraxie.assessment.note.includes('lecture'),
  'ataraxieAnalysis should frame as lecture, not verdict'
);
console.log('✓ Falsification 4: ataraxieAnalysis frames as lecture, not verdict');

// ─── Typed evidence algebra — cross-checks ────────────────────────────────

// 5. Deux preuves du même LLM ne sont PAS deux preuves indépendantes
const proof1 = algebra.createEvidenceProfile({ type: 'formal', source: 'gpt-4', properties: { method: 'lean' } });
const proof2 = algebra.createEvidenceProfile({ type: 'formal', source: 'gpt-4', properties: { method: 'lean' } });
const independence = algebra.assessIndependence(proof1, proof2);
assert.strictEqual(independence.independent, false, 'Same LLM + same method = not independent');
console.log('✓ Cross-check: two proofs from same LLM are not independent');

// 6. Preuves de types différents ne sont PAS directement comparables
const cmp = algebra.compareEvidenceStrength(
  algebra.createEvidenceProfile({ type: 'formal', source: 'lean' }),
  algebra.createEvidenceProfile({ type: 'causal', source: 'replay' })
);
assert.strictEqual(cmp.comparable, false, 'Formal and causal are incommensurable');
console.log('✓ Cross-check: formal vs causal are incommensurable');

// ─── Concept-level falsification ──────────────────────────────────────────

// Filtrer les concepts qui ont un rôle défini (le mapping conceptRoles est
// appliqué séparément ; ici on ne teste que les définitions explicites).
const conceptsWithRole = m.ALL_CONCEPTS.filter(c => c.role != null);

// 7. Aucun concept lens ne doit avoir runtimeAuthority=true
const lenses = conceptsWithRole.filter(c => c.role === 'lens');
for (const lens of lenses) {
  assert.strictEqual(lens.runtimeAuthority, false, `${lens.id} lens should not have runtimeAuthority`);
}
console.log(`✓ All ${lenses.length} lenses have runtimeAuthority=false`);

// 8. Tous les core commitments doivent avoir runtimeAuthority=true
const cores = conceptsWithRole.filter(c => c.role === 'core');
for (const core of cores) {
  assert.strictEqual(core.runtimeAuthority, true, `${core.id} core should have runtimeAuthority`);
}
console.log(`✓ All ${cores.length} core commitments have runtimeAuthority=true`);

// 9. Toutes les speculative hypotheses doivent avoir historicalConfidence <= 0.5
const spec = conceptsWithRole.filter(c => c.role === 'speculative');
for (const s of spec) {
  assert.ok(s.historicalConfidence <= 0.5, `${s.id} speculative should have confidence <= 0.5`);
}
console.log(`✓ All ${spec.length} speculative hypotheses have confidence <= 0.5`);

// 10. Vérification d'intégrité : les concepts sans rôle explicite ne doivent
//     pas avoir runtimeAuthority défini (sinon le registre est incohérent).
const conceptsWithoutRole = m.ALL_CONCEPTS.filter(c => c.role == null);
const authorizedWithoutRole = conceptsWithoutRole.filter(c => c.runtimeAuthority != null);
assert.deepStrictEqual(authorizedWithoutRole, [], 'No concept without explicit role should have runtimeAuthority set');
console.log(`✓ ${conceptsWithoutRole.length} concepts without explicit role have no runtimeAuthority`);

console.log('\n=== All falsification tests passed ===');
