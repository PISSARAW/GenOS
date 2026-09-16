'use strict';

/**
 * Tests for philosophy services.
 * Run: node tests/test_philosophy_services.js
 */

const assert = require('assert');
const ontologyService = require('../src/services/ontologyService');
const causalityService = require('../src/services/causalityService');
const temporalIdentityService = require('../src/services/temporalIdentityService');
const consciousnessService = require('../src/services/consciousnessService');
const epistemologyService = require('../src/services/epistemologyService');
const processPhilosophyService = require('../src/services/processPhilosophyService');
const ethicsService = require('../src/services/ethicsService');
const phenomenologyService = require('../src/services/phenomenologyService');
const contingencyService = require('../src/services/contingencyService');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('\n=== Ontology Service ===');

test('defineBeing creates an agent being', () => {
  const being = ontologyService.defineBeing('agent-1', { type: 'orchestrator' });
  assert.strictEqual(being.id, 'agent-1');
  assert.strictEqual(being.substance, 'orchestrator');
  assert.strictEqual(being.attributes.size, 0);
});

test('setAttribute sets and updates attributes', () => {
  ontologyService.setAttribute('agent-1', 'status', 'running');
  const attr = ontologyService.getOntology('agent-1').attributes.get('status');
  assert.strictEqual(attr.value, 'running');
  assert.strictEqual(attr.previousValue, null);
});

test('defineMode sets execution modes', () => {
  ontologyService.defineMode('agent-1', 'localRuntime', 'possible');
  const mode = ontologyService.getOntology('agent-1').modes.get('localRuntime');
  assert.strictEqual(mode.constraint, 'possible');
});

test('hypostatize creates autonomous entity from attribute', () => {
  ontologyService.setAttribute('agent-1', 'specialty', 'code-review');
  const hyp = ontologyService.hypostatize('agent-1', 'specialty');
  assert.strictEqual(hyp.type, 'hypostasis');
  assert.strictEqual(hyp.essence, 'code-review');
});

test('defineBeing throws on invalid agentId', () => {
  assert.throws(() => ontologyService.defineBeing(''), /valid agentId/);
});

console.log('\n=== Causality Service ===');

test('recordCausalLink records a link', () => {
  const link = causalityService.recordCausalLink({
    causeAgent: 'agent-1',
    effectAgent: 'agent-2',
    mechanism: 'tool_call',
  });
  assert.ok(link.id);
  assert.strictEqual(link.causeAgent, 'agent-1');
  assert.strictEqual(link.effectAgent, 'agent-2');
});

test('computeNecessity detects necessity versus contingency', () => {
  const result = causalityService.computeNecessity({
    causeAgent: 'a',
    effectAgent: 'b',
    actualOutcome: 'completed',
    counterfactualOutcome: 'blocked',
  });
  assert.strictEqual(result, 'necessary');
});

test('isDeterministic checks outcomes determinism', () => {
  const runs = [
    { finalOutcome: 'completed' },
    { finalOutcome: 'completed' },
    { finalOutcome: 'completed' },
  ];
  assert.strictEqual(causalityService.isDeterministic(runs), true);
  runs.push({ finalOutcome: 'failed' });
  assert.strictEqual(causalityService.isDeterministic(runs), false);
});

test('checkRegularity validates causal ordering', () => {
  const links = [
    { timestamp: 1000, causeAgent: 'a', effectAgent: 'b' },
    { timestamp: 2000, causeAgent: 'b', effectAgent: 'c' },
  ];
  assert.strictEqual(causalityService.checkRegularity(links), true);
});

console.log('\n=== Consciousness Service ===');

test('recordQualia stores subjective experience', () => {
  const q = consciousnessService.recordQualia({
    agentId: 'agent-1',
    experience: 'processing evidence',
    intensity: 0.8,
    valence: 0.5,
  });
  assert.strictEqual(q.agentId, 'agent-1');
  assert.strictEqual(q.intensity, 0.8);
});

test('recordIntentionality captures aboutness', () => {
  const i = consciousnessService.recordIntentionality({
    agentId: 'agent-1',
    target: 'mission-42',
    mode: 'aboutness',
  });
  assert.strictEqual(i.target, 'mission-42');
});

test('checkSupervenience detects physical base dependency', () => {
  // Two identical physical states must yield identical mental states (supervenience)
  const physicalA = { cpu: 'x86', memory: '8GB' };
  const physicalB = { cpu: 'x86', memory: '8GB' };
  const result = consciousnessService.checkSupervenience({
    mentalState: { strategy: 'tree-search' },
    physicalState: physicalA,
  });
  // Same physical base → same hash → supervenes
  const result2 = consciousnessService.checkSupervenience({
    mentalState: { strategy: 'tree-search' },
    physicalState: physicalB,
  });
  assert.strictEqual(result.supervenes, result2.supervenes);
});

test('mindBodyInteraction records cogitans/extensa coupling', () => {
  const mb = consciousnessService.mindBodyInteraction({
    agentId: 'agent-1',
    body: 'workspace-alpha',
    interaction: 'causal',
  });
  assert.strictEqual(mb.interaction, 'causal');
});

console.log('\n=== Epistemology Service ===');

test('getFormIdeal returns Platonic forms', () => {
  const form = epistemologyService.getFormIdeal('perfect_agent');
  assert.strictEqual(form.role, 'orchestrator');
  assert.strictEqual(form.evidence, 'complete');
});

test('fourCauses maps Aristotelian causes to agent fields', () => {
  const agent = {
    substrate: 'genos_process',
    role: 'implementation',
    parent_agent_id: 'orch-1',
    current_task: 'build-feature',
  };
  const causes = epistemologyService.fourCauses({ agent });
  assert.strictEqual(causes.material, 'genos_process');
  assert.strictEqual(causes.formal, 'implementation');
  assert.strictEqual(causes.efficient, 'orch-1');
  assert.strictEqual(causes.final, 'build-feature');
});

test('categoriesA priori returns Kantian structures', () => {
  const cats = epistemologyService.categoriesAPriori();
  assert.deepStrictEqual(cats.modality, ['possibility', 'existence', 'necessity']);
});

console.log('\n=== Process Philosophy Service ===');

test('actualOccasion captures Whiteheadian event', () => {
  const occasion = processPhilosophyService.actualOccasion({
    agentId: 'agent-1',
    event: { outcome: 'success' },
  });
  assert.strictEqual(occasion.actuality, 'success');
});

test('differenceAndRepetition measures Deleuzian intensity', () => {
  const result = processPhilosophyService.differenceAndRepetition([
    { id: 1 }, { id: 2 }, { id: 1 },
  ]);
  assert.strictEqual(result.repetition, 3);
  assert.strictEqual(result.difference, 2);
});

test('dasein describes Heideggerian being-in-the-world', () => {
  const d = processPhilosophyService.dasein({
    agentId: 'agent-1',
    thrownness: 'genos_backend',
  });
  assert.strictEqual(d.beingInTheWorld, true);
});

test('rhizome builds acentered connections', () => {
  const agents = [
    { id: 'a', parent_agent_id: null },
    { id: 'b', parent_agent_id: 'a' },
  ];
  const r = processPhilosophyService.rhizome(agents);
  assert.strictEqual(r.acentered, true);
  assert.strictEqual(r.connections.length, 2);
});

console.log('\n=== Ethics Service ===');

test('utilitarianRanking orders actions by utility', () => {
  const actions = [
    { name: 'A', value: 10 },
    { name: 'B', value: 50 },
    { name: 'C', value: 30 },
  ];
  const ranking = ethicsService.utilitarianRanking({
    actions,
    utilityOf: a => a.value,
  });
  assert.strictEqual(ranking[0].action.name, 'B');
});

test('deontologicalCheck flags rule violations', () => {
  const check = ethicsService.deontologicalCheck({
    action: 'execute',
    rules: [
      { name: 'lease_respected', satisfied: true },
      { name: 'budget_ok', satisfied: false },
    ],
  });
  assert.strictEqual(check.compliant, false);
  assert.deepStrictEqual(check.violations, ['budget_ok']);
});

test('virtueEthicsAssessment rates agent character', () => {
  const assessment = ethicsService.virtueEthicsAssessment({
    agentId: 'agent-1',
    virtues: { wisdom: 0.9, courage: 0.8, temperance: 0.7, justice: 0.9 },
  });
  assert.strictEqual(assessment.character, 'excellent');
});

console.log('\n=== Phenomenology Service ===');

test('intentionality captures Husserlian aboutness', () => {
  const i = phenomenologyService.intentionality({
    agentId: 'agent-1',
    target: 'goal-7',
    mode: 'aboutness',
  });
  assert.strictEqual(i.noema, 'goal-7');
});

test('perception maps Merleau-Ponty body-world', () => {
  const p = phenomenologyService.perception({
    agentId: 'agent-1',
    body: 'workspace-1',
    world: 'mission-env',
  });
  assert.strictEqual(p.body, 'workspace-1');
});

test('existencePrecedesEssence detects Sartrean bad faith', () => {
  const e = phenomenologyService.existencePrecedesEssence({
    agentId: 'agent-1',
    status: 'idle',
    role: 'orchestrator',
  });
  assert.strictEqual(e.existence, true);
  assert.strictEqual(e.badFaith, true);
});

console.log('\n=== Contingency Service ===');

test('absoluteContingency marks hyperchaos', () => {
  const c = contingencyService.absoluteContingency({
    agentId: 'agent-1',
    necessary: ['existence'],
    contingent: ['role', 'budget'],
  });
  assert.strictEqual(c.hyperchaos, true);
});

test('badiouEvent identifies rupture events', () => {
  const e1 = contingencyService.badiouEvent({ agentId: 'a', eventType: 'AGENT_COMPLETED' });
  assert.strictEqual(e1.rupture, true);
  const e2 = contingencyService.badiouEvent({ agentId: 'a', eventType: 'TOOL_CALL' });
  assert.strictEqual(e2.rupture, false);
});

test('mathematicsOfBeing computes set operations', () => {
  const agents = [
    { id: 'a', status: 'running' },
    { id: 'b', status: 'completed' },
    { id: 'a', status: 'running' },
  ];
  const m = contingencyService.mathematicsOfBeing({ agents });
  assert.deepStrictEqual(m.union, ['a', 'b']);
  // Seul 'a' est présent dans le statut 'running' ; 'b' est 'completed'
  assert.strictEqual(m.intersection.length, 2); // deux entrées avec status running
});

// Summary
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
