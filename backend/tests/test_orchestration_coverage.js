const assert = require('assert');
const { MCP_TOOL_COUNT, observedTools, auditMission } = require('../src/services/orchestrationCoverageService');
const strategyContracts = require('../src/services/strategyContractService');
const strategyController = require('../src/controllers/strategyController');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  console.log('=== TEST 1: Constantes et extraction observedTools ===');
  assert.equal(MCP_TOOL_COUNT, 65, 'MCP_TOOL_COUNT doit valoir 65');
  const extracted = observedTools([
    { action: 'genos_snapshot', detail: 'then genos_replay', payload_json: '{"tool":"genos_merge"}' },
    { action: 'other_action', detail: 'calling genos_diagnose now', payload_json: '' }
  ]);
  assert.deepEqual(extracted, ['genos_diagnose', 'genos_merge', 'genos_replay', 'genos_snapshot']);
  console.log('  ✅ Extraction des outils observés validée.');

  console.log('\n=== TEST 2: Audit complet de mission via auditMission() ===');
  const db = await getDatabase();
  const testOrchId = `orch_coverage_test_${Date.now()}`;

  // 1. Insertion de l'agent orchestrateur puis sauvegarde d'un contrat de stratégie
  await db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode)
     VALUES (?, 'Test Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator')`,
    testOrchId
  );
  const contract = await strategyContracts.saveContract(db, {
    agentId: testOrchId,
    problem: 'Diagnose and fix security vulnerability with high risk',
    createdBy: 'test_runner'
  });
  assert(contract && contract.contract, 'Le contrat doit être sauvegardé');

  // 2. Audit initial avant événements : couverture incomplète
  const initialAudit = await auditMission(db, testOrchId);
  assert.equal(initialAudit.orchestratorId, testOrchId);
  assert.equal(initialAudit.protocol.advertisedTools, 65);
  assert.equal(initialAudit.protocol.observedCount, 0);
  assert(initialAudit.orchestration.requiredTools.length > 0, 'Des outils doivent être requis par le plan');
  assert.equal(initialAudit.verdict, 'required-coverage-incomplete');
  console.log(`  ✅ Audit initial vérifié (requis: ${initialAudit.orchestration.requiredTools.length}, verdict: ${initialAudit.verdict})`);

  // 3. Simulation des événements de télémétrie pour tous les outils requis
  for (const tool of initialAudit.orchestration.requiredTools) {
    await db.run(
      `INSERT INTO telemetry_events (agent_id, event_type, action, detail, severity, payload_json)
       VALUES (?, 'TOOL_USE', ?, ?, 'info', '{}')`,
      testOrchId, tool, `Executed tool ${tool}`
    );
  }
  await db.run(
    `INSERT INTO telemetry_events (agent_id, event_type, action, detail, severity, payload_json)
     VALUES (?, 'ORCHESTRATION_DECISION', 'strategy_selected', 'Strategy chosen', 'info', '{}')`,
    testOrchId
  );

  // 4. Nouvel audit : couverture complète atteinte
  const completedAudit = await auditMission(db, testOrchId);
  assert.equal(completedAudit.verdict, 'required-coverage-complete');
  assert.equal(completedAudit.orchestration.missingRequiredTools.length, 0);
  assert(completedAudit.orchestration.decisions.includes('strategy_selected'));
  console.log('  ✅ Audit post-exécution validé : required-coverage-complete');

  console.log('\n=== TEST 3: Action Contrôleur HTTP auditCoverage ===');
  let responseData = null;
  let responseStatus = 200;
  const mockRes = {
    status: (code) => { responseStatus = code; return mockRes; },
    json: (data) => { responseData = data; return mockRes; }
  };

  // Cas 3.1: Orchestrateur existant
  await strategyController.auditCoverage({ params: { orchestratorId: testOrchId } }, mockRes, (err) => { throw err; });
  assert.equal(responseStatus, 200);
  assert.equal(responseData.verdict, 'required-coverage-complete');
  console.log('  ✅ Contrôleur 200 OK avec payload d audit');

  // Cas 3.2: Paramètre manquant
  responseStatus = 200;
  await strategyController.auditCoverage({ params: {} }, mockRes, (err) => { throw err; });
  assert.equal(responseStatus, 400);
  assert.equal(responseData.error.code, 'ORCHESTRATOR_ID_REQUIRED');
  console.log('  ✅ Contrôleur 400 Bad Request sur ID absent');

  // Cas 3.3: Orchestrateur sans contrat
  responseStatus = 200;
  await strategyController.auditCoverage({ params: { orchestratorId: 'non_existent_orchestrator' } }, mockRes, (err) => { throw err; });
  assert.equal(responseStatus, 404);
  assert.equal(responseData.error.code, 'STRATEGY_CONTRACT_NOT_FOUND');
  console.log('  ✅ Contrôleur 404 Not Found sur contrat inexistant');

  console.log('\n=============================================================');
  console.log('TOUS LES TESTS D AUDIT DE COUVERTURE ONT RÉUSSI AVEC SUCCÈS !');
  console.log('=============================================================');
}

run()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Échec des tests d audit de couverture:', error);
    await closeDatabase();
    process.exit(1);
  });

