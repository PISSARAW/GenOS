const assert = require('assert');
const {
  calculateMembranePotential,
  evaluateChemoreceptorGate,
  evaluateThalamicGuardrail,
  selectAffordantTools,
  evaluateToolGating,
  RESTING_POTENTIAL_MV,
  DEFAULT_THRESHOLD_MV
} = require('../src/services/biomimeticToolGatingService');
const { applyBiomimeticGating } = require('../src/services/toolLeasePolicy');
const { getGatedToolSchemas, BIOMIMETIC_GATING_POLICY } = require('../src/services/mcpContract');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('======================================================================');
console.log('   GenOS Biomimetic Upstream Tool Gating Test Suite');
console.log('======================================================================\n');

// 1. Level 1: Membrane Potential & Hyperpolarization on Dialogue
console.log('--- 1. Level 1: Membrane Potential & Chemoreceptor Gate ---');

runTest('1.1 Conversational query produces hyperpolarization (IPSP, Vm < -70mV)', () => {
  const query = "Bonjour, peux-tu m'expliquer le principe théorique du tri rapide ?";
  const res = calculateMembranePotential(query);
  assert.ok(res.membranePotentialMv <= RESTING_POTENTIAL_MV, `Expected Vm <= -70mV, got ${res.membranePotentialMv}`);
  assert.strictEqual(res.isDepolarized, false);
  assert.strictEqual(res.classification, 'HYPERPOLARIZED');
});

runTest('1.2 Action request produces depolarization (EPSP, Vm >= -55mV)', () => {
  const query = "Lance un snapshot de l'agent worker-42 et persiste les données.";
  const res = calculateMembranePotential(query);
  assert.ok(res.membranePotentialMv >= DEFAULT_THRESHOLD_MV, `Expected Vm >= -55mV, got ${res.membranePotentialMv}`);
  assert.strictEqual(res.isDepolarized, true);
  assert.strictEqual(res.classification, 'ACTION_POTENTIAL');
});

runTest('1.3 Chemoreceptor gate executes sub-millisecond (< 1 ms)', () => {
  const query = "Explique-moi la différence entre un processus et un thread.";
  const gate = evaluateChemoreceptorGate(query);
  assert.strictEqual(gate.gate, 'CLOSED');
  assert.strictEqual(gate.requiresTools, false);
  assert.ok(gate.latencyMicros < 1000, `Expected latency < 1000µs, got ${gate.latencyMicros}µs`);
});

// 2. Level 2: Thalamic Guardrail for Ambiguous Queries
console.log('\n--- 2. Level 2: Thalamic Guardrail (Binary Cognitive Filter) ---');

runTest('2.1 Deeply hyperpolarized conversational prompt is immediately rejected', () => {
  const guard = evaluateThalamicGuardrail("Merci beaucoup pour ces explications, au revoir !");
  assert.strictEqual(guard.passed, false);
  assert.strictEqual(guard.requiresTools, false);
  assert.strictEqual(guard.reason, 'HYPERPOLARIZED_INHIBITION');
});

runTest('2.2 High-conviction action prompt immediately confirmed supra-threshold', () => {
  const guard = evaluateThalamicGuardrail("Exécute les tests unitaires et lance le déploiement du repo.");
  assert.strictEqual(guard.passed, true);
  assert.strictEqual(guard.requiresTools, true);
  assert.strictEqual(guard.reason, 'SUPRA_THRESHOLD_ACTIVATION');
});

runTest('2.3 Ambiguous request with target and imperative verb resolved to YES', () => {
  const guard = evaluateThalamicGuardrail("Peux-tu regarder dans le repo s'il y a un souci ?");
  assert.strictEqual(guard.passed, true);
  assert.strictEqual(guard.requiresTools, true);
  assert.strictEqual(guard.reason, 'THALAMIC_AMBIGUITY_RESOLVED_YES');
});

// 3. Level 3: Basal Ganglia Selective Disinhibition
console.log('\n--- 3. Level 3: Basal Ganglia Selective Disinhibition ---');

const ALL_CANDIDATES = [
  'genos_snapshot', 'genos_replay', 'genos_capsule_create',
  'genos_orchestrate', 'genos_delegate_worker', 'genos_change_organization',
  'genos_change_strategy', 'genos_trinity_launch',
  'genos_audit', 'genos_biomimicry',
  'genos_diagnose', 'genos_run', 'genos_diff'
];

runTest('3.1 Selectively recruits snapshot tools without leaking orchestrator tools', () => {
  const selected = selectAffordantTools("Sauvegarde l'état actuel dans un snapshot et crée une capsule", ALL_CANDIDATES);
  assert.ok(selected.includes('genos_snapshot'), 'Must include genos_snapshot');
  assert.ok(selected.includes('genos_capsule_create'), 'Must include genos_capsule_create');
  assert.strictEqual(selected.includes('genos_trinity_launch'), false, 'Must not leak trinity');
  assert.strictEqual(selected.includes('genos_change_organization'), false, 'Must not leak organization');
});

runTest('3.2 Selectively recruits strategy tools when strategy modification is requested', () => {
  const selected = selectAffordantTools("Change de stratégie et bascule sur le protocole MCTS", ALL_CANDIDATES);
  assert.ok(selected.includes('genos_change_strategy'), 'Must include genos_change_strategy');
  assert.strictEqual(selected.includes('genos_snapshot'), false, 'Must not include snapshot');
});

// 4. Unified Gating & False Affordance Shield for 7B Models
console.log('\n--- 4. Unified Gating & 7B Distraction Shield ---');

runTest('4.1 Conversational request exposes ZERO tools to the 7B model', () => {
  const result = evaluateToolGating("Quelles sont les meilleures pratiques en Clean Architecture ?", ALL_CANDIDATES);
  assert.strictEqual(result.requiresTools, false);
  assert.strictEqual(result.gateState, 'HYPERPOLARIZED');
  assert.strictEqual(result.disinhibitedTools.length, 0);
  assert.strictEqual(result.disinhibitedCount, 0);
  assert.strictEqual(result.shieldScore, 1.0); // 100% of tools shielded
});

runTest('4.2 Targeted action exposes strictly disinhibited subset (< 4 tools out of 13)', () => {
  const result = evaluateToolGating("Lance un diagnostic d'échec sur la dernière exécution", ALL_CANDIDATES);
  assert.strictEqual(result.requiresTools, true);
  assert.strictEqual(result.gateState, 'ACTION_POTENTIAL');
  assert.ok(result.disinhibitedCount > 0 && result.disinhibitedCount <= 3);
  assert.ok(result.shieldScore >= 0.7); // At least 70% distraction shielded
});

// 5. Integration with toolLeasePolicy and mcpContract
console.log('\n--- 5. Integration with toolLeasePolicy & mcpContract ---');

runTest('5.1 applyBiomimeticGating prunes conversational lease to empty array', () => {
  const { gatedLease, gating } = applyBiomimeticGating(ALL_CANDIDATES, "Explique-moi la théorie de la relativité");
  assert.strictEqual(gating.requiresTools, false);
  assert.strictEqual(gatedLease.length, 0);
});

runTest('5.2 getGatedToolSchemas returns zero schemas on dialogue, avoiding 7B context clutter', () => {
  const gated = getGatedToolSchemas("Bonjour, quelle heure est-il à Tokyo selon toi ?", ALL_CANDIDATES);
  assert.strictEqual(gated.requiresTools, false);
  assert.strictEqual(Object.keys(gated.schemas).length, 0);
});

runTest('5.3 getGatedToolSchemas returns only disinhibited schemas on action intent', () => {
  const gated = getGatedToolSchemas("Sauvegarder un snapshot de sécurité", ALL_CANDIDATES);
  assert.strictEqual(gated.requiresTools, true);
  assert.ok(Object.keys(gated.schemas).includes('genos_snapshot'));
  assert.strictEqual(Object.keys(gated.schemas).includes('genos_trinity_launch'), false);
});

runTest('5.4 BIOMIMETIC_GATING_POLICY contract specification is well-formed', () => {
  assert.strictEqual(BIOMIMETIC_GATING_POLICY.restingPotentialMv, -70.0);
  assert.strictEqual(BIOMIMETIC_GATING_POLICY.depolarizationThresholdMv, -55.0);
  assert.strictEqual(BIOMIMETIC_GATING_POLICY.levels.length, 3);
});

console.log('\n======================================================================');
console.log(`TOTAL BIOMIMETIC GATING TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('======================================================================\n');

if (failed > 0) {
  process.exit(1);
}
