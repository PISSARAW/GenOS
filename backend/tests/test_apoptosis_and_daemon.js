/**
 * Test suite for Emergency Apoptosis script & Configurable Proactive Sentinel Daemon
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { apoptosis } = require('../bin/genos-apoptosis.cjs');
const analyst = require('../src/services/proactiveGitHubAnalyst');
const daemon = require('../src/services/daemonAgentAutostart');
const controller = require('../src/controllers/daemonController');
const { getDatabase, closeDatabase } = require('../src/db');

async function runTests() {
  console.log('=== TEST 1: Script d\'Urgence Apoptose (genos-apoptosis.cjs) ===');

  const db = await getDatabase();
  const testAgentId = `test_agent_apoptosis_${Date.now()}`;

  // Insertion d'un agent de test actif
  await db.run(
    `INSERT INTO agents (id, name, role, status, execution_mode)
     VALUES (?, 'Test Runaway Agent', 'Worker', 'running', 'worker')`,
    testAgentId
  );

  // Exécution de l'apoptose
  const res = await apoptosis();
  assert.equal(res.success, true, 'Apoptosis doit réussir');
  assert(res.stoppedAgents >= 1, 'Au moins un agent doit être stoppé');

  const updatedAgent = await db.get('SELECT status, current_task FROM agents WHERE id = ?', testAgentId);
  assert.equal(updatedAgent.status, 'apoptosis', 'L agent doit être passé en statut apoptosis');
  assert.equal(updatedAgent.current_task, 'Emergency apoptosis triggered');
  console.log(`  ✅ Apoptose validée : agent stoppé et marqué 'apoptosis' (Total stoppés: ${res.stoppedAgents}).`);

  // Cas où la DB n'existe pas
  const invalidRes = await apoptosis('C:\\path\\that\\does\\not\\exist\\fake.db');
  assert.equal(invalidRes.success, false);
  assert.equal(invalidRes.reason, 'DB_NOT_FOUND');
  console.log('  ✅ Gestion d erreur robuste sur base introuvable validée.');

  console.log('\n=== TEST 2: Analyseur GitHub Proactif (proactiveGitHubAnalyst) ===');

  const repos = analyst.discoverRepositories();
  assert(Array.isArray(repos), 'discoverRepositories doit retourner un tableau');
  assert(repos.length > 0, 'Au moins un dépôt Git doit être découvert (dont GenOS)');
  const currentRepo = repos.find((r) => r.path.toLowerCase().includes('genos'));
  assert(currentRepo, 'Le dépôt GenOS doit être découvert');
  console.log(`  ✅ Découverte réussie : ${repos.length} dépôt(s) détecté(s).`);

  const genosAnalysis = analyst.analyzeRepository(currentRepo.path);
  assert.equal(typeof genosAnalysis.branch, 'string');
  assert(genosAnalysis.techStack.includes('Rust') || genosAnalysis.techStack.includes('Node'), 'Stack tech détectée');
  assert(Array.isArray(genosAnalysis.recentCommits), 'Commits récents listés');
  console.log(`  ✅ Analyse unitaire réussie : branche '${genosAnalysis.branch}', stack: '${genosAnalysis.techStack}'.`);

  // Génération du rapport avec personnalité personnalisée
  const customConfig = {
    name: 'Chronos',
    personality: 'Observateur temporel et gardien des synchronisations git.',
    role: 'Temporal Sentinel & Auditor'
  };
  const report = analyst.generateProactiveReport([genosAnalysis], customConfig);
  assert(report.includes('Chronos'), 'Le rapport doit inclure le nom configuré');
  assert(report.includes('Observateur temporel'), 'Le rapport doit refléter la personnalité configurée');
  assert(report.includes('Temporal Sentinel & Auditor'), 'Le rapport doit inclure le rôle configuré');
  console.log('  ✅ Génération de rapport proactif avec personnalité validée.');

  const saved = analyst.saveReport(report);
  assert(fs.existsSync(saved.latestFile), 'Le fichier markdown du rapport doit être créé');
  console.log(`  ✅ Sauvegarde du rapport validée (${saved.latestFile}).`);

  console.log('\n=== TEST 3: Gestion de la Configuration & Auto-démarrage Windows ===');

  // Sauvegarde d'une configuration personnalisée
  const savedConfig = daemon.saveDaemonConfig({
    name: 'Kofi',
    personality: 'Observateur patient et rigoureux qui veille sur vos projets.',
    role: 'Autonomous Proactive Guardian',
    openTerminalOnStartup: true
  });
  assert.equal(savedConfig.name, 'Kofi');
  assert.equal(savedConfig.personality, 'Observateur patient et rigoureux qui veille sur vos projets.');

  const loadedConfig = daemon.getDaemonConfig();
  assert.equal(loadedConfig.name, 'Kofi');
  console.log('  ✅ Configuration persistante personnalisée validée.');

  // Cycle d'auto-démarrage Windows
  if (process.platform === 'win32') {
    const enableRes = daemon.enableAutostart({ name: 'Kofi' });
    assert.equal(enableRes.success, true);
    assert(fs.existsSync(enableRes.autostartFile), 'Le script .bat doit exister dans Startup');

    const statusAfterEnable = daemon.getAutostartStatus();
    assert.equal(statusAfterEnable.enabled, true);
    console.log('  ✅ Activation de l auto-démarrage Windows validée (.bat créé).');

    // Désactivation
    const disableRes = daemon.disableAutostart();
    assert.equal(disableRes.success, true);
    const statusAfterDisable = daemon.getAutostartStatus();
    assert.equal(statusAfterDisable.enabled, false);
    console.log('  ✅ Désactivation de l auto-démarrage Windows validée (.bat nettoyé).');

    // Ré-activation pour laisser le système opérationnel
    daemon.enableAutostart({ name: 'Sekou' });
    console.log('  ✅ Auto-démarrage ré-activé proprement avec configuration opérationnelle.');
  }

  console.log('\n=== TEST 4: Contrôleur API (daemonController) ===');

  let responseData = null;
  const mockRes = {
    json: (d) => { responseData = d; return mockRes; }
  };

  // 4.1 GET /api/daemon/status
  await controller.getStatus({}, mockRes, (err) => { throw err; });
  assert.equal(typeof responseData.enabled, 'boolean');
  console.log('  ✅ API GET /api/daemon/status 200 OK');

  // 4.2 POST /api/daemon/configure
  responseData = null;
  await controller.configure({
    body: {
      name: 'Sekou',
      personality: 'Analyste architectural proactif et gardien vigilant de l écosystème.',
      role: 'Autonomous GitHub Auditor & Sentinel'
    }
  }, mockRes, (err) => { throw err; });
  assert.equal(responseData.success, true);
  assert.equal(responseData.config.name, 'Sekou');
  console.log('  ✅ API POST /api/daemon/configure 200 OK');

  // 4.3 POST /api/daemon/audit
  responseData = null;
  await controller.runAudit({ body: { name: 'Sekou' } }, mockRes, (err) => { throw err; });
  assert.equal(responseData.success, true);
  assert(responseData.audit.totalRepos > 0);
  console.log(`  ✅ API POST /api/daemon/audit 200 OK (${responseData.audit.totalRepos} dépôts audités).`);

  console.log('\n=============================================================');
  console.log('TOUS LES TESTS APOPTOSIS & PROACTIVE DAEMON ONT RÉUSSI !');
  console.log('=============================================================');
}

runTests()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Échec des tests apoptosis & daemon:', err);
    await closeDatabase();
    process.exit(1);
  });
