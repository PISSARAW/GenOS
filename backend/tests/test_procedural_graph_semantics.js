'use strict';

const assert = require('assert');
const semantics = require('../src/services/proceduralGraphSemanticsService');
const identity = require('../src/services/proceduralIdentityService');
const mutation = require('../src/services/proceduralMutationSelectionService');

function makeOrganism(nodes, synapses) {
  return {
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: { id: 'sem-test', version: 1, parentId: null, lineageId: 'l1' },
    structure: { nodes, synapses },
  };
}

// 1. Graphe sain : entry -> action -> terminal, gate obligatoire sur le chemin
const healthy = makeOrganism(
  [
    { id: 'start', type: 'action' },
    { id: 'verify', type: 'gate', required: true },
    { id: 'end', type: 'terminal' },
  ],
  [
    { from: 'start', to: 'verify', type: 'excitatory', weight: 0.8 },
    { from: 'verify', to: 'end', type: 'excitatory', weight: 0.9 },
  ]
);
const healthyResult = semantics.validateGraphSemantics(healthy);
assert.strictEqual(healthyResult.valid, true, `healthy graph must be valid: ${healthyResult.errors.join('; ')}`);

// 2. Cas de la revue : START -> A, B -> TERMINAL, B inaccessible
const unreachableB = makeOrganism(
  [
    { id: 'start', type: 'action' },
    { id: 'a', type: 'action' },
    { id: 'b', type: 'action' },
    { id: 'end', type: 'terminal' },
  ],
  [
    { from: 'start', to: 'a', type: 'excitatory', weight: 0.8 },
    { from: 'b', to: 'end', type: 'excitatory', weight: 0.8 },
  ]
);
const unreachableResult = semantics.validateGraphSemantics(unreachableB);
assert.strictEqual(unreachableResult.valid, false, 'unreachable B must make the graph invalid');
assert.ok(unreachableResult.errors.some((e) => e.includes("node 'b' is not reachable")), `got: ${unreachableResult.errors.join('; ')}`);
assert.ok(unreachableResult.errors.some((e) => e.includes("terminal 'end' is not reachable")), `got: ${unreachableResult.errors.join('; ')}`);

// 3. Gate obligatoire inaccessible
const gateIsland = makeOrganism(
  [
    { id: 'start', type: 'action' },
    { id: 'end', type: 'terminal' },
    { id: 'loneGate', type: 'gate', required: true },
  ],
  [{ from: 'start', to: 'end', type: 'excitatory', weight: 0.8 }]
);
const gateResult = semantics.validateGraphSemantics(gateIsland);
assert.strictEqual(gateResult.valid, false);
assert.ok(gateResult.errors.some((e) => e.includes("required gate 'loneGate' is not reachable")));

// 4. Pas de terminal du tout
const noTerminal = makeOrganism(
  [
    { id: 'start', type: 'action' },
    { id: 'a', type: 'action' },
  ],
  [{ from: 'start', to: 'a', type: 'excitatory', weight: 0.8 }]
);
const noTerminalResult = semantics.validateGraphSemantics(noTerminal);
assert.strictEqual(noTerminalResult.valid, false);
assert.ok(noTerminalResult.errors.some((e) => e.includes('no terminal node')));

// 5. Terminal avec sortie non autorisée
const leakingTerminal = makeOrganism(
  [
    { id: 'start', type: 'action' },
    { id: 'end', type: 'terminal' },
    { id: 'a', type: 'action' },
  ],
  [
    { from: 'start', to: 'end', type: 'excitatory', weight: 0.8 },
    { from: 'end', to: 'a', type: 'excitatory', weight: 0.5 },
  ]
);
const leakResult = semantics.validateGraphSemantics(leakingTerminal);
assert.strictEqual(leakResult.valid, false);
assert.ok(leakResult.errors.some((e) => e.includes("terminal 'end' has an outgoing synapse")));

// 6. Graphe vide / structure absente
assert.strictEqual(semantics.validateGraphSemantics({}).valid, false);
assert.strictEqual(semantics.validateGraphSemantics(null).valid, false);

// 7. Pureté : validateGraphSemantics ne modifie pas l'organisme
const frozen = JSON.parse(JSON.stringify(unreachableB));
semantics.validateGraphSemantics(unreachableB);
assert.strictEqual(JSON.stringify(frozen), JSON.stringify(unreachableB), 'validateGraphSemantics must not mutate');

// 8. Compatibilité: les variants scellés issus d'un parent sémantiquement sain
//    restent sémantiquement valides pour les mutations additives/pondérales
//    (ADD_NODE, ADD_SYNAPSE, ADJUST_WEIGHT). Les mutations soustractives
//    (REMOVE_*) peuvent légitimement casser l'exécutabilité — c'est le rôle
//    de la validation sémantique de les écarter, pas du mutation engine.
const parent = {
  apiVersion: 'genos/v1alpha1',
  kind: 'ProceduralOrganism',
  metadata: { id: 'p1', version: 3, parentId: null, lineageId: 'l1' },
  structure: {
    nodes: [
      { id: 'start', type: 'action' },
      { id: 'verify', type: 'gate', required: true },
      { id: 'end', type: 'terminal' },
    ],
    synapses: [
      { from: 'start', to: 'verify', type: 'excitatory', weight: 0.8 },
      { from: 'verify', to: 'end', type: 'excitatory', weight: 0.9 },
    ],
  },
};
const variants = mutation.generateVariants(parent, 5);
assert.ok(variants.length >= 1);
const SAFE_OPS = ['ADD_NODE', 'ADD_SYNAPSE', 'ADJUST_WEIGHT'];
for (const v of variants) {
  const sealed = mutation.sealCandidate(parent, v, null);
  const semRes = semantics.validateGraphSemantics(sealed);
  if (SAFE_OPS.includes(v.operations[0].op)) {
    assert.strictEqual(semRes.valid, true, `sealed variant (${v.operations[0].op}) must stay semantically valid: ${semRes.errors.join('; ')}`);
  }
  const schemaRes = identity.validateOrganism(sealed);
  assert.strictEqual(schemaRes.valid, true, `sealed variant must stay schema-valid: ${schemaRes.errors.join('; ')}`);
}

// 9. REMOVE_NODE qui isole le terminal doit être détecté par la sémantique
//    (le mutation engine peut produire des candidats non exécutables —
//    c'est le rôle de la validation sémantique de les écarter)
const isolatedTerminal = makeOrganism(
  [
    { id: 'start', type: 'action', locked: true },
    { id: 'mid', type: 'action' },
    { id: 'end', type: 'terminal', required: true },
  ],
  [
    { from: 'start', to: 'mid', type: 'excitatory', weight: 0.8 },
    { from: 'mid', to: 'end', type: 'excitatory', weight: 0.8 },
  ]
);
// REMOVE_NODE retire le premier nœud non requis/non verrouillé ('mid' ici car
// 'start' est locked), ce qui isole le terminal. La sémantique doit le détecter.
const removeVariant = mutation.generateVariants(isolatedTerminal, 5)
  .find((v) => v.operations[0].op === 'REMOVE_NODE');
assert.ok(removeVariant, 'a REMOVE_NODE variant must exist');
assert.strictEqual(removeVariant.operations[0].target.id, 'mid');
const sealedRemove = mutation.sealCandidate(isolatedTerminal, removeVariant, null);
const removeSemRes = semantics.validateGraphSemantics(sealedRemove);
assert.strictEqual(removeSemRes.valid, false, 'REMOVE_NODE breaking reachability must be semantically invalid');
assert.ok(
  removeSemRes.errors.some((e) => e.includes("terminal 'end' is not reachable")),
  `expected terminal isolation, got: ${removeSemRes.errors.join('; ')}`
);

console.log('=== procedural graph semantics: all passed ===');
