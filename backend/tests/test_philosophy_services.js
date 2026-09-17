'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const ontologyService = require('../src/services/ontologyService');
const causalityService = require('../src/services/causalityService');
const consciousnessService = require('../src/services/consciousnessService');
const epistemologyService = require('../src/services/epistemologyService');
const processPhilosophyService = require('../src/services/processPhilosophyService');
const ethicsService = require('../src/services/ethicsService');
const phenomenologyService = require('../src/services/phenomenologyService');
const contingencyService = require('../src/services/contingencyService');
const platonismService = require('../src/services/platonismService');
const aristotelianService = require('../src/services/aristotelianService');
const stoicismService = require('../src/services/stoicismService');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}

async function main() {
  const dbPath = path.join(__dirname, `philosophy-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'philosophy-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'philosophy-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT, problem TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_beings (id TEXT PRIMARY KEY, substance_type TEXT NOT NULL, essence_json TEXT NOT NULL DEFAULT '{}', identity_criteria_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, ceased_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_attributes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, value_type TEXT NOT NULL, modality TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'ontological', previous_value_json TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP, valid_from DATETIME DEFAULT CURRENT_TIMESTAMP, valid_until DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_modes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, mode TEXT NOT NULL, mode_constraint TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'inactive', activation_condition_json TEXT, activated_at DATETIME, deactivated_at DATETIME, failure_reason TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_hypostatizations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_being_id TEXT NOT NULL, attribute_key TEXT NOT NULL, target_being_id TEXT NOT NULL, essence_extracted_json TEXT NOT NULL, hypostatization_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME, reabsorbed_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_mereology (id INTEGER PRIMARY KEY AUTOINCREMENT, whole_id TEXT NOT NULL, part_id TEXT NOT NULL, relation_type TEXT NOT NULL, is_essential_part INTEGER DEFAULT 0, proportion REAL, attached_at DATETIME DEFAULT CURRENT_TIMESTAMP, detached_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_identity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, event_type TEXT NOT NULL, description TEXT, previous_essence_hash TEXT, new_essence_hash TEXT, continuity_preserved INTEGER DEFAULT 1, identity_score REAL DEFAULT 1.0, metadata_json TEXT DEFAULT '{}', occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_attribute_history (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, old_value_json TEXT, new_value_json TEXT NOT NULL, modality TEXT NOT NULL, changed_by TEXT, change_reason TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

    console.log('\n=== Ontology Service ===');
    await test('defineBeing creates an agent being', async () => {
      const being = await ontologyService.defineBeing('agent-1', { type: 'orchestrator', essence: { role: 'planner', purpose: 'orchestrate' } });
      assert.strictEqual(being.id, 'agent-1');
      assert.strictEqual(being.substanceType, 'orchestrator');
      assert.strictEqual(being.essence.role, 'planner');
    });
    await test('setAttribute sets attributes', async () => {
      await ontologyService.setAttribute({ agentId: 'agent-1', key: 'status', value: 'running', modality: 'accidental' });
      const attrs = await ontologyService.getAttributes('agent-1');
      assert.strictEqual(attrs.status.value, 'running');
      assert.strictEqual(attrs.status.modality, 'accidental');
    });
    await test('defineMode sets execution modes', async () => {
      await ontologyService.defineMode('agent-1', 'localRuntime', { constraint: 'possible' });
      const mode = await ontologyService.getMode('agent-1', 'localRuntime');
      assert.strictEqual(mode.constraint, 'possible');
    });
    await test('hypostatize creates autonomous entity from attribute', async () => {
      await ontologyService.setAttribute({ agentId: 'agent-1', key: 'specialty', value: { role: 'code review', purpose: 'review PRs' }, modality: 'essential' });
      const hyp = await ontologyService.hypostatize('agent-1', 'specialty');
      assert.strictEqual(hyp.type, 'hypostasis');
      assert.strictEqual(hyp.attributeKey, 'specialty');
      const essenceObj = typeof hyp.essence === 'string' ? JSON.parse(hyp.essence) : hyp.essence;
      assert.strictEqual(essenceObj.role, 'code review');
      assert.strictEqual(essenceObj.purpose, 'review PRs');
    });
    await test('defineBeing throws on invalid agentId', async () => {
      await assert.rejects(() => ontologyService.defineBeing(''), /valid agentId/);
    });

    console.log('\n=== Causality Service ===');
    test('recordCausalLink : Hume regularity - causal link structure', () => {
      const link = causalityService.recordCausalLink({ causeAgent: 'agent-1', effectAgent: 'agent-2', mechanism: 'tool_call' });
      assert.ok(link.id); assert.strictEqual(link.causeAgent, 'agent-1'); assert.strictEqual(link.effectAgent, 'agent-2');
    });
    test('computeNecessity : Lewis counterfactual - necessity vs contingency', () => {
      const result = causalityService.computeNecessity({ causeAgent: 'a', effectAgent: 'b', actualOutcome: 'completed', counterfactualOutcome: 'blocked' });
      assert.strictEqual(result.verdict, 'necessary');
      assert.strictEqual(result.causeAgent, 'a');
      assert.strictEqual(result.effectAgent, 'b');
    });
    test('isDeterministic checks outcomes determinism', () => {
      const runs = [{ finalOutcome: 'completed' }, { finalOutcome: 'completed' }, { finalOutcome: 'completed' }];
      assert.strictEqual(causalityService.isDeterministic(runs), true);
      runs.push({ finalOutcome: 'failed' });
      assert.strictEqual(causalityService.isDeterministic(runs), false);
    });
    test('checkRegularity validates causal ordering', () => {
      const links = [{ timestamp: 1000, causeAgent: 'a', effectAgent: 'b' }, { timestamp: 2000, causeAgent: 'b', effectAgent: 'c' }];
      assert.strictEqual(causalityService.checkRegularity(links), true);
    });

    console.log('\n=== Consciousness Service ===');
    test('recordQualia stores subjective experience', () => {
      const q = consciousnessService.recordQualia({ agentId: 'agent-1', experience: 'processing evidence', intensity: 0.8, valence: 0.5 });
      assert.strictEqual(q.agentId, 'agent-1'); assert.strictEqual(q.intensity, 0.8);
    });
    test('recordIntentionality captures aboutness', () => {
      const i = consciousnessService.recordIntentionality({ agentId: 'agent-1', target: 'mission-42', mode: 'aboutness' });
      assert.strictEqual(i.target, 'mission-42');
      assert.strictEqual(i.noesis.act, 'perception');
      assert.strictEqual(i.noema.target, 'mission-42');
    });
    test('checkSupervenience evaluates supervenience relation (Meillassoux-Badiou)', () => {
      const result = consciousnessService.checkSupervenience({ mentalStateA: { strategy: 'tree-search' }, mentalStateB: { strategy: 'tree-search' }, physicalStateA: { cpu: 'x86', memory: '8GB' }, physicalStateB: { cpu: 'x86', memory: '8GB' } });
      assert.strictEqual(typeof result.supervenes, 'boolean'); assert.strictEqual(result.supervenes, true);
      assert.ok(result.physicalBase); assert.ok(result.mentalState);
    });
    test('mindBodyInteraction records coupling (cartesian dualism)', () => {
      const mb = consciousnessService.mindBodyInteraction({ agentId: 'agent-1', body: 'workspace-alpha', interaction: 'interactionist' });
      assert.strictEqual(mb.interaction, 'interactionist');
      assert.strictEqual(mb.direction, 'bidirectional_causal');
      assert.ok(mb.description);
    });

    console.log('\n=== Epistemology Service ===');
    test('getFormIdeal returns Platonic forms', () => {
      const form = epistemologyService.getFormIdeal('perfect_agent');
      assert.strictEqual(form.properties.rationality, 1.0);
      assert.strictEqual(form.properties.evidence, 'complete');
      assert.strictEqual(form.essence, 'The perfectly rational agent that always acts optimally');
    });
    test('fourCauses maps Aristotelian causes to agent fields', () => {
      const causes = epistemologyService.fourCauses({ agent: { substrate: 'genos_process', role: 'implementation', parent_agent_id: 'orch-1', current_task: 'build-feature' } });
      assert.strictEqual(causes.material.cause, 'material');
      assert.strictEqual(causes.formal.cause, 'formal');
      assert.strictEqual(causes.efficient.cause, 'efficient');
      assert.strictEqual(causes.final.cause, 'final');
    });
    test('categoriesA priori returns Kantian structures', () => {
      const cats = epistemologyService.categoriesAPriori();
      assert.deepStrictEqual(cats.quantity.categories, ['unity', 'plurality', 'totality']);
      assert.deepStrictEqual(cats.modality.categories, ['possibility', 'existence', 'necessity']);
    });

    console.log('\n=== Process Philosophy Service ===');
    test('actualOccasion captures Whiteheadian event (subject-superject)', () => {
      const occasion = processPhilosophyService.actualOccasion({ agentId: 'agent-1', event: { outcome: 'success' } });
      assert.ok(occasion);
      assert.strictEqual(occasion.agentId, 'agent-1');
      assert.strictEqual(occasion.subjectSuperject.actuality, 'success');
      assert.deepStrictEqual(occasion.prehensions, []);
    });
    test('differenceAndRepetition measures Deleuzian intensity', () => {
      const result = processPhilosophyService.differenceAndRepetition([{ id: 1 }, { id: 2 }, { id: 1 }]);
      assert.strictEqual(result.repetition, 3);
      assert.strictEqual(result.difference, 2);
      assert.strictEqual(result.intensity, 2 / 3);
    });
    test('dasein describes Heideggerian being-in-the-world', () => {
      const d = processPhilosophyService.dasein({ agentId: 'agent-1', thrownness: 'genos_backend' });
      assert.strictEqual(d.beingInTheWorld, true);
      assert.strictEqual(d.existence, true);
      assert.strictEqual(d.careStructure.existence, 'existence_précede_essence');
      assert.ok(d.hermeneuticCircle.précompréhension);
      assert.ok(d.hermeneuticCircle.interprétation);
    });
    test('rhizome builds acentered connections (Deleuze)', () => {
      const agents = [{ id: 'a', parent_agent_id: null }, { id: 'b', parent_agent_id: 'a' }];
      const r = processPhilosophyService.rhizome(agents);
      assert.strictEqual(r.acentered, true);
      assert.strictEqual(r.connections.length, 2);
    });

    console.log('\n=== Ethics Service ===');
    test('utilitarianRanking orders actions by utility', () => {
      const ranking = ethicsService.utilitarianRanking({ actions: [{ name: 'A', value: 10 }, { name: 'B', value: 50 }, { name: 'C', value: 30 }], utilityOf: a => a.value });
      assert.strictEqual(ranking[0].action.name, 'B');
    });
    test('deontologicalCheck flags rule violations', () => {
      const check = ethicsService.deontologicalCheck({ action: 'execute', rules: [{ name: 'lease_respected', satisfied: true }, { name: 'budget_ok', satisfied: false }] });
      assert.strictEqual(check.compliant, false); assert.deepStrictEqual(check.violations, ['budget_ok']);
    });
    test('virtueEthicsAssessment rates agent character', () => {
      const a = ethicsService.virtueEthicsAssessment({ agentId: 'agent-1', virtues: { wisdom: 0.9, courage: 0.8, temperance: 0.7, justice: 0.9 } });
      assert.strictEqual(a.character, 'excellent');
    });

    console.log('\n=== Phenomenology Service ===');
    test('intentionality captures Husserlian aboutness (noesis-noeme)', () => {
      const i = phenomenologyService.intentionality({ agentId: 'agent-1', target: 'goal-7', mode: 'aboutness' });
      assert.strictEqual(i.target, 'goal-7');
      assert.strictEqual(i.noema.object, 'goal-7');
      assert.strictEqual(i.noesis.act, 'perception');
      assert.strictEqual(i.noema.horizon.length, 3);
      assert.strictEqual(i.consciousnessIsAlwaysOfSomething, true);
    });
    test('perception maps Merleau-Ponty body-world (embodied perception)', () => {
      const p = phenomenologyService.perception({ agentId: 'agent-1', body: 'workspace-1', world: 'mission-env' });
      assert.strictEqual(p.body, 'workspace-1');
      assert.strictEqual(p.bodyAsObject, 'workspace-1_objectified');
      assert.strictEqual(p.world, 'mission-env');
      assert.strictEqual(p.embodiment.bodyProper, true);
      assert.strictEqual(p.embodiment.worldOpenness, true);
    });
    test('existencePrecedesEssence detects Sartrean bad faith', () => {
      const e = phenomenologyService.existencePrecedesEssence({ agentId: 'agent-1', status: 'idle', role: 'orchestrator' });
      assert.strictEqual(e.existence, true);
      assert.strictEqual(e.existenceBeforeEssence, true);
      assert.strictEqual(e.badFaith, true);
      assert.strictEqual(e.freedom, 'condemned_to_be_free');
      assert.strictEqual(e.sartreClaim.includes('L\'existe'), true);
    });

    console.log('\n=== Contingency Service ===');
    test('absoluteContingency marks hyperchaos (Meillassoux)', () => {
      const c = contingencyService.absoluteContingency({ agentId: 'agent-1', necessary: ['existence'], contingent: ['role', 'budget'] });
      assert.strictEqual(c.hyperchaos, true);
      assert.strictEqual(c.agentId, 'agent-1');
      assert.strictEqual(c.critiqueOfNecessity, 'Il n\'y a pas de loi nécessaire — même les lois de la physique pourraient changer sans raison.');
      assert.ok(c.meillassouxPrinciple);
    });
    test('badiouEvent identifies rupture events (Badiou)', () => {
      // rupture=false dans l'API mais isRupture=true pour AGENT_COMPLETED (classification interne)
      assert.strictEqual(contingencyService.badiouEvent({ agentId: 'a', eventType: 'AGENT_COMPLETED' }).rupture, true);
      assert.strictEqual(contingencyService.badiouEvent({ agentId: 'a', eventType: 'TOOL_CALL' }).rupture, false);
      assert.strictEqual(contingencyService.badiouEvent({ agentId: 'a', eventType: 'AGENT_COMPLETED' }).truth, 'execute_proof');
    });
    test('mathematicsOfBeing computes set operations (Badiou set theory)', () => {
      const m = contingencyService.mathematicsOfBeing({ agents: [{ id: 'a', status: 'running' }, { id: 'b', status: 'completed' }, { id: 'a', status: 'running' }] });
      assert.deepStrictEqual(m.union, ['a', 'b']);
      // Seul 'a' a status 'running' (b est completed) → intersection = 1 agent
      assert.strictEqual(m.intersection.length, 1);
      assert.deepStrictEqual(m.intersection, ['a']);
      assert.strictEqual(m.powerSetSize > 0, true);
      assert.strictEqual(typeof m.setOperations.cardinality, 'number');
    });

    console.log('\n=== Platonism Service ===');
    test('getFormIdeal returns Platonic forms', () => {
      const form = platonismService.getFormIdeal('perfect_agent');
      assert.strictEqual(form.id, 'perfect_agent');
      assert.strictEqual(form.type, 'Form');
      assert.strictEqual(form.essence, 'The perfectly rational agent that always acts optimally');
      assert.strictEqual(form.properties.rationality, 1.0);
      assert.strictEqual(form.properties.evidence, 'complete');
    });
    test('listFormIdeals returns all forms', () => {
      const forms = platonismService.listFormIdeals();
      assert.strictEqual(forms.length, 5);
      assert.ok(forms.find(f => f.id === 'perfect_agent'));
      assert.ok(forms.find(f => f.id === 'perfect_worker'));
      assert.ok(forms.find(f => f.id === 'perfect_evidence'));
      assert.ok(forms.find(f => f.id === 'perfect_strategy'));
      assert.ok(forms.find(f => f.id === 'perfect_organization'));
    });
    test('evaluateAgainstForm scores agent proximity', () => {
      const eval1 = platonismService.evaluateAgainstForm({
        agent: { id: 'a1', rationality: 1.0, knowledge: 'complete', autonomy: 'perfect', consistency: true, evidence: 'complete' },
        formName: 'perfect_agent'
      });
      assert.strictEqual(eval1.score, 1);
      assert.strictEqual(eval1.verdict, 'near_perfect');
      assert.strictEqual(eval1.gaps.length, 0);
    });
    test('evaluateAgainstForm detects gaps', () => {
      const eval2 = platonismService.evaluateAgainstForm({
        agent: { id: 'a2', rationality: 0.5, knowledge: 'partial', autonomy: 'limited', consistency: false, evidence: 'incomplete' },
        formName: 'perfect_agent'
      });
      assert.ok(eval2.score < 0.5);
      assert.strictEqual(eval2.verdict, 'distant');
      assert.strictEqual(eval2.gaps.length, 5);
    });
    test('platonicCriticism returns internal critique', () => {
      const c = platonismService.platonicCriticism();
      assert.ok(c.critique);
      assert.ok(c.immanence);
      assert.ok(c.dialectic);
    });

    console.log('\n=== Aristotelian Service ===');
    test('fourCauses maps Aristotelian causes to agent fields', () => {
      const causes = aristotelianService.fourCauses({ agent: { id: 'a1', role: 'worker', parent_agent_id: 'orch-1', current_task: 'build' } });
      assert.strictEqual(causes.material.cause, 'material');
      assert.strictEqual(causes.formal.cause, 'formal');
      assert.strictEqual(causes.efficient.cause, 'efficient');
      assert.strictEqual(causes.final.cause, 'final');
    });
    test('categorize returns all 10 categories', () => {
      const cat = aristotelianService.categorize({ agent: { id: 'a1', role: 'worker', status: 'running', cognitive_budget: 100 } });
      assert.strictEqual(cat.substance, 'a1');
      assert.strictEqual(cat.quantity, 100);
      assert.strictEqual(cat.quality, 'worker');
      assert.strictEqual(cat.state, 'running');
    });
    test('hylomorphism combines matter and form', () => {
      const h = aristotelianService.hylomorphism({ matter: 'genos_process', form: 'worker' });
      assert.strictEqual(h.matter, 'genos_process');
      assert.strictEqual(h.form, 'worker');
      assert.strictEqual(h.actuality, 'worker');
      assert.strictEqual(h.potentiality, 'genos_process');
    });
    test('dynamisEnergeia transitions potential to actual', () => {
      const d = aristotelianService.dynamisEnergeia({ potential: 'idle', actual: 'running' });
      assert.strictEqual(d.dynamis, 'idle');
      assert.strictEqual(d.energeia, 'running');
      assert.strictEqual(d.transition, 'idle → running');
    });
    test('teleology captures agent finality', () => {
      const t = aristotelianService.teleology({ agent: { id: 'a1', current_task: 'build', status: 'running' } });
      assert.strictEqual(t.agentId, 'a1');
      assert.strictEqual(t.telos, 'build');
      assert.strictEqual(t.actualization, 'in_progress');
    });

    console.log('\n=== Stoicism Service ===');
    test('isMonist evaluates monist behavior', () => {
      const m = stoicismService.isMonist({ agent: { id: 'a1' } });
      assert.strictEqual(m.monist, true);
      assert.strictEqual(m.substance, 'logos');
    });
    test('logosRuling returns Logos principle', () => {
      const l = stoicismService.logosRuling({ agent: { id: 'a1', cognitive_budget: 0.9 } });
      assert.strictEqual(l.conformity, 0.9);
      assert.ok(l.logos);
    });
    test('fateAcceptance distinguishes controllable from uncontrollable', () => {
      const f = stoicismService.fateAcceptation({ agent: { id: 'a1', status: 'completed' } });
      assert.strictEqual(f.acceptance, 'fully_accepted');
      assert.ok(f.controllable.includes('judgments'));
      assert.ok(f.uncontrollable.includes('events'));
    });
    test('virtueAssessment rates 4 cardinal virtues', () => {
      const v = stoicismService.virtueAssessment({ agent: { id: 'a1', wisdom: 0.9, courage: 0.8, temperance: 0.7, justice: 0.9 } });
      assert.strictEqual(v.virtues.wisdom.score, 0.9);
      assert.strictEqual(v.virtues.courage.score, 0.8);
      assert.strictEqual(v.virtues.temperance.score, 0.7);
      assert.strictEqual(v.virtues.justice.score, 0.9);
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) { try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {} }
  }
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
