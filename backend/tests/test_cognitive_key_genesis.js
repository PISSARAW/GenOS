'use strict';

const assert = require('node:assert/strict');
const {
  findCandidates,
  proposeKey,
  admitProposedKey,
  isEvidenceValid
} = require('../src/cognition/cognitiveKeyGenesis');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');

const KEY_MAP = new Map(COGNITIVE_KEYS.map((key) => [key.id, key]));

// Recettes synthétiques performantes avec co-occurrence récurrente
const recipes = [
  { id: 'recipe.g1', keys: ['cognitive.falsification-search', 'cognitive.counterfactual-variation', 'cognitive.frame-analysis'] },
  { id: 'recipe.g2', keys: ['cognitive.falsification-search', 'cognitive.counterfactual-variation', 'cognitive.structural-abstraction'] },
  { id: 'recipe.g3', keys: ['cognitive.falsification-search', 'cognitive.counterfactual-variation'] },
  { id: 'recipe.g4', keys: ['cognitive.boundary-probe'] }
];
const performance = { 'recipe.g1': 3, 'recipe.g2': 2, 'recipe.g3': 1, 'recipe.g4': 0 };

// 1. Candidatures : paires co-occurrentes dans les recettes performantes
const candidates = findCandidates({ recipes, performance });
assert.ok(candidates.length > 0, 'co-occurrent pairs must be found');
const falsCf = candidates.find((c) => pairEquals(c.keyPair, ['cognitive.falsification-search', 'cognitive.counterfactual-variation']));
assert.ok(falsCf, 'falsification+counterfactual pair must be a candidate');
assert.equal(falsCf.occurrences, 3);
assert.deepEqual(falsCf.sourceRecipes.sort(), ['recipe.g1', 'recipe.g2', 'recipe.g3']);

function pairEquals(pair, expected) {
  const sorted = [...pair].sort().join('|');
  return sorted === [...expected].sort().join('|');
}

// 2. La paire avec la recette non-performante (g4) n'est pas candidate
assert.ok(!candidates.some((c) => c.keyPair.includes('cognitive.boundary-probe')));

// 3. Proposition : instruction composée, provenance = clés sources
const proposal = proposeKey(falsCf, KEY_MAP);
assert.ok(proposal);
assert.ok(proposal.id.startsWith('cognitive.'));
assert.ok(proposal.instruction.length >= 40);
assert.ok(proposal.instruction.includes('refuter')); // instruction composée des deux sources
assert.deepEqual(proposal.composedOf, falsCf.keyPair.sort());
assert.deepEqual(proposal.derivedFrom.sort(), ['cognitive.counterfactual-variation', 'cognitive.falsification-search']);
assert.equal(proposal.genesis.stage, 'proposed');
assert.equal(proposal.genesis.occurrences, 3);

// 4. Validation expérimentale : exigences strictes
assert.equal(isEvidenceValid(null), false);
assert.equal(isEvidenceValid({}), false);
assert.equal(isEvidenceValid({ runs: 2, observedGain: 0.5, context: 'debugging missions' }), false, 'runs < 3');
assert.equal(isEvidenceValid({ runs: 3, observedGain: 0, context: 'debugging missions' }), false, 'gain <= 0');
assert.equal(isEvidenceValid({ runs: 3, observedGain: 0.5, context: '' }), false, 'no context');
assert.equal(isEvidenceValid({ runs: 3, observedGain: 0.5, context: 'debugging missions' }), true);

// 5. Admission fail-closed : sans preuve, jamais d'admission
const noEvidence = admitProposedKey({ proposal });
assert.equal(noEvidence.admitted, false);
assert.equal(noEvidence.reason, 'invalid_evidence');

const weakEvidence = admitProposedKey({ proposal, evidence: { runs: 1, observedGain: 0.9, context: 'one run' } });
assert.equal(weakEvidence.admitted, false);
assert.equal(weakEvidence.reason, 'invalid_evidence');

// 6. Admission avec preuve valide : échoue à la validation du registre
//    CAR l'opération composée n'est pas dans l'enum — c'est voulu :
//    l'admission d'une nouvelle opération est un changement de contrat
//    explicite (extension du schéma), pas une insertion silencieuse.
const validEvidence = { runs: 5, observedGain: 0.23, context: 'multi-agent debugging missions, vs arm A control' };
const admission = admitProposedKey({ proposal, evidence: validEvidence });
assert.equal(admission.admitted, false);
assert.equal(admission.reason, 'registry_validation_failed');
assert.ok(admission.errors.some((e) => e.includes('operation must be one of')),
  'composed operation must be rejected by the closed enum');

// 7. Admission réussie si l'opération existe déjà dans l'enum
//    (proposition dont la composition retombe sur une opération connue)
const reuseProposal = { ...proposal, operation: 'falsification-search' };
const reuseAdmission = admitProposedKey({ proposal: reuseProposal, evidence: validEvidence });
assert.equal(reuseAdmission.admitted, true, reuseAdmission.errors ? JSON.stringify(reuseAdmission.errors) : '');
assert.equal(reuseAdmission.key.genesis.stage, 'admitted');
assert.equal(reuseAdmission.key.genesis.evidence.runs, 5);

// 8. Pas de double admission
const doubleAdmission = admitProposedKey({ proposal: reuseProposal, evidence: validEvidence, keys: [...COGNITIVE_KEYS, reuseAdmission.key] });
assert.equal(doubleAdmission.admitted, false);
assert.equal(doubleAdmission.reason, 'id_already_registered');

// 9. proposeKey : candidate inconnue → null
assert.equal(proposeKey({ keyPair: ['cognitive.unknown-a', 'cognitive.unknown-b'] }, KEY_MAP), null);

console.log(
  `Cognitive key genesis tests passed (${candidates.length} candidate pair(s), ` +
  `fail-closed admission enforced, reuse-operation admitted with evidence).`
);
