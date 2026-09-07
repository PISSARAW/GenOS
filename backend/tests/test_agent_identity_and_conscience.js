const assert = require('assert');
const path = require('path');
const agentIdentity = require('../src/services/agentIdentityService');
const agentConscience = require('../src/services/agentConscienceService');
const { getDatabase } = require('../src/db');
const agentDeployService = require('../src/services/deploy/agentDeploy.service');
const AgentRepository = require('../src/repositories/agent.repository');

async function runTests() {
  console.log("=== TESTS : AGENT IDENTITY & COGNITIVE CONSCIENCE ===");

  // --- 1. Tests d'Identité ---
  console.log("1. Test de génération d'identité et de sens culturel...");
  const kwameIdentity = agentIdentity.generateAgentIdentity({ preferredName: 'Kwame', role: 'Architecte' });
  assert.strictEqual(kwameIdentity.name, 'Kwame');
  assert.ok(kwameIdentity.name_meaning.includes('Akan'));
  assert.ok(kwameIdentity.introduction.includes("Je m'appelle Kwame"));
  assert.ok(kwameIdentity.introduction.includes("Architecte"));
  console.log(`   [OK] Kwame : "${kwameIdentity.introduction}"`);

  const randomIdentity = agentIdentity.generateAgentIdentity({ role: 'Security Auditor' });
  assert.ok(randomIdentity.name);
  assert.ok(randomIdentity.name_meaning);
  assert.ok(randomIdentity.introduction.includes(randomIdentity.name));
  console.log(`   [OK] Aléatoire : "${randomIdentity.introduction}"`);

  // --- 2. Tests de Conscience Cognitive ---
  console.log("\n2. Test du modèle ConscienceState (Dissonance & Eurêka)...");
  let state = agentConscience.createConscienceState();
  assert.strictEqual(state.dissonanceLevel, 0.0);
  assert.strictEqual(state.eurekaMoments, 0);
  assert.strictEqual(state.isApoptotic, false);
  assert.strictEqual(state.baselineBudget, 100.0);

  const normalized = agentConscience.createConscienceState({
    currentBudget: -10,
    dissonanceLevel: Number.NaN,
    eurekaMoments: -2,
    maxDissonanceThreshold: 0
  });
  assert.strictEqual(normalized.currentBudget, 0);
  assert.strictEqual(normalized.dissonanceLevel, 0);
  assert.strictEqual(normalized.eurekaMoments, 0);
  assert.ok(normalized.maxDissonanceThreshold > 0);

  // Erreurs en boucle augmentent la dissonance
  const step1 = agentConscience.evaluateBranch(state, { errorsInLoop: 4 });
  assert.strictEqual(step1.apoptoticTriggered, false);
  assert.strictEqual(state.dissonanceLevel, 10.0); // 4 * 2.5
  assert.ok(step1.harmony < 100);
  console.log(`   [OK] 4 erreurs -> Dissonance = ${state.dissonanceLevel}, Harmonie = ${step1.harmony}%`);

  // Moment Eurêka diminue la dissonance par deux et augmente le budget
  agentConscience.triggerEureka(state);
  assert.strictEqual(state.eurekaMoments, 1);
  assert.strictEqual(state.dissonanceLevel, 5.0);
  console.log(`   [OK] Eurêka ! Dissonance réduite à = ${state.dissonanceLevel}, Eurêkas = ${state.eurekaMoments}`);

  const rateLimited = agentConscience.createConscienceState({ dissonanceLevel: 32 });
  for (let index = 0; index < 4; index += 1) agentConscience.triggerEureka(rateLimited, { now: 1000 + index, limit: 3, windowMs: 60000 });
  assert.strictEqual(rateLimited.eurekaMoments, 3);
  console.log(`   [OK] Limite Eureka par fenêtre respectée (${rateLimited.eurekaMoments}/3).`);

  // Dépassement du seuil de dissonance -> Apoptose cognitive
  const step3 = agentConscience.evaluateBranch(state, { errorsInLoop: 20 });
  assert.strictEqual(step3.apoptoticTriggered, true);
  assert.strictEqual(state.isApoptotic, true);
  assert.strictEqual(state.currentBudget, 0.0);
  console.log(`   [OK] Seuil franchi -> Apoptose cognitive déclenchée (isApoptotic: true, budget: 0)`);

  const apoptoticEurekaCount = state.eurekaMoments;
  agentConscience.triggerEureka(state);
  assert.strictEqual(state.eurekaMoments, apoptoticEurekaCount);
  assert.strictEqual(state.currentBudget, 0.0);
  console.log(`   [OK] Eurêka ignoré après apoptose.`);

  // Prompt d'introspection
  const healthyState = agentConscience.createConscienceState();
  const promptBlock = agentConscience.formatConsciencePrompt(healthyState);
  assert.ok(promptBlock.includes('HARMONIE COGNITIVE'));
  assert.ok(promptBlock.includes("Seuil d'apoptose"));
  console.log(`   [OK] Bloc de conscience pour prompt validé.`);

  // --- 3. Tests d'Intégration SQLite & Déploiement ---
  console.log("\n3. Test d'intégration Base de Données et Déploiement...");
  const db = await getDatabase();
  
  // Créer un workspace local de test s'il n'existe pas
  await db.run(
    `INSERT OR IGNORE INTO workspaces (id, name, path, visibility, language) 
     VALUES ('ws-test-identity', 'test-workspace', '${process.cwd().replace(/\\/g, '/')}', 'Private', 'TypeScript')`
  );

  const deployment = await agentDeployService.deployAgent({
    workspaceId: 'ws-test-identity',
    executionMode: 'orchestrator',
    role: 'Lead Cognitive Strategist',
    name: 'Zola',
    prompt: 'Analyser l\'harmonie du système'
  });

  assert.ok(deployment.agentId);
  assert.strictEqual(deployment.agentName, 'Zola');

  const repo = new AgentRepository(db);
  const agentRow = await repo.findById(deployment.agentId);
  assert.strictEqual(agentRow.name, 'Zola');
  assert.ok(agentRow.name_meaning.includes('Kongo'));
  assert.strictEqual(agentRow.dissonance_level, 0.0);
  assert.strictEqual(agentRow.is_apoptotic, 0);
  console.log(`   [OK] Agent déployé en base avec Nom="${agentRow.name}", Sens="${agentRow.name_meaning}" et Conscience initialisée.`);

  // Vérifier listWithDetails
  const detailedList = await repo.listWithDetails('a.id = ?', [deployment.agentId]);
  assert.strictEqual(detailedList.length, 1);
  assert.strictEqual(detailedList[0].name, 'Zola');
  assert.ok(detailedList[0].nameMeaning);
  assert.strictEqual(detailedList[0].dissonanceLevel, 0.0);
  assert.strictEqual(detailedList[0].isApoptotic, 0);
  console.log(`   [OK] AgentRepository.listWithDetails retourne les attributs d'identité et de conscience.`);

  // --- 4. Tests de Persistance SQLite et Concurrence Optimiste ---
  console.log("\n4. Test de persistance avec révision optimiste et reason...");
  const agentId = deployment.agentId;
  const loadedState = await agentConscience.loadConscienceState(db, agentId);
  assert.strictEqual(loadedState.revision, 0);

  // Première transition : évaluation
  agentConscience.evaluateBranch(loadedState, { errorsInLoop: 2 });
  await agentConscience.persistConscienceState(db, agentId, loadedState, { reason: 'eval_loop_test' });
  assert.strictEqual(loadedState.revision, 1);

  const reloadedState = await agentConscience.loadConscienceState(db, agentId);
  assert.strictEqual(reloadedState.revision, 1);
  assert.strictEqual(reloadedState.dissonanceLevel, 5.0);

  // Deuxième transition : Eurêka
  agentConscience.triggerEureka(reloadedState);
  await agentConscience.persistConscienceState(db, agentId, reloadedState, { reason: 'eureka_breakthrough' });
  assert.strictEqual(reloadedState.revision, 2);
  assert.strictEqual(reloadedState.dissonanceLevel, 2.5);
  assert.strictEqual(reloadedState.eurekaMoments, 1);
  console.log(`   [OK] Révisions incrémentées séquentiellement (0 -> 1 -> 2) avec motifs enregistrés.`);

  // --- 5. Test d'Auditabilité des Transitions ---
  console.log("\n5. Test de récupération de l'historique des transitions...");
  const transitions = await agentConscience.getConscienceTransitions(db, agentId, { limit: 10 });
  assert.strictEqual(transitions.length, 2);
  assert.strictEqual(transitions[0].toRevision, 2);
  assert.strictEqual(transitions[0].reason, 'eureka_breakthrough');
  assert.strictEqual(transitions[1].toRevision, 1);
  assert.strictEqual(transitions[1].reason, 'eval_loop_test');
  console.log(`   [OK] Transitions récupérées et ordonnées avec succès (${transitions.length} transitions trouvées).`);

  // --- 6. Test de Robustesse sur Agent Inexistant ---
  console.log("\n6. Test de détection d'agent inexistant...");
  let nonExistentError = null;
  try {
    const ghostState = agentConscience.createConscienceState();
    await agentConscience.persistConscienceState(db, 'non-existent-agent-id', ghostState);
  } catch (err) {
    nonExistentError = err;
  }
  assert.ok(nonExistentError);
  assert.ok(nonExistentError.message.includes('not found in database'));
  console.log(`   [OK] Erreur explicite retournée pour agent inexistant: "${nonExistentError.message}".`);

  // --- 7. Test des Outils MCP & Contrôleur API ---
  console.log("\n7. Test des Outils MCP et du Contrôleur Express...");
  const { dispatchTool } = require('../src/services/mcpToolRegistry');
  const mcpStateRes = await dispatchTool('genos_get_conscience_state', { agent_id: agentId });
  assert.strictEqual(mcpStateRes.kind, 'bio');
  assert.strictEqual(mcpStateRes.result.conscience.revision, 2);
  assert.strictEqual(mcpStateRes.result.conscience.eurekaMoments, 1);

  const mcpHistoryRes = await dispatchTool('genos_get_conscience_history', { agent_id: agentId, limit: 5 });
  assert.strictEqual(mcpHistoryRes.kind, 'bio');
  assert.strictEqual(mcpHistoryRes.result.count, 2);
  assert.strictEqual(mcpHistoryRes.result.transitions[0].reason, 'eureka_breakthrough');

  const conscienceController = require('../src/controllers/agentConscienceController');
  let ctrlJson = null;
  const mockRes = {
    json: (data) => { ctrlJson = data; return mockRes; },
    status: () => mockRes
  };
  await conscienceController.getAgentConscience({ params: { id: agentId } }, mockRes, () => {});
  assert.strictEqual(ctrlJson.agentId, agentId);
  assert.strictEqual(ctrlJson.conscience.revision, 2);

  await conscienceController.getConscienceTransitions({ params: { id: agentId }, query: { limit: 10 } }, mockRes, () => {});
  assert.strictEqual(ctrlJson.agentId, agentId);
  assert.strictEqual(ctrlJson.count, 2);
  console.log(`   [OK] Outils MCP et contrôleur HTTP validés avec succès.`);

  console.log("\n=== TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS ! ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Échec des tests :", err);
  process.exit(1);
});
