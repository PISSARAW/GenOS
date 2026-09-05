const assert = require('assert');
const immune = require('../src/services/immuneSystem');
const workerRecovery = require('../src/services/workerFailureRecoveryService');

async function runTests() {
  console.log('=== TEST 1 : Nettoyage et Réparation par la Protéine Chaperon ===');
  // Cas 1.1 : Markdown avec balises et texte préambule/postambule
  const dirtyMarkdown = `
Voici le rapport de mission demandé :
\`\`\`json
{
  "author": { "name": "CodexWorker" },
  "outcome": "success",
  "claims": [
    { "statement": "All tests pass", "evidence": ["exit_0"] },
  ],
}
\`\`\`
Fin de transmission.
`;
  const res1 = immune.chaperoneRepairJson(dirtyMarkdown, (data) => {
    if (!Array.isArray(data.claims)) throw new Error('claims doit être un tableau');
  });
  assert.strictEqual(res1.ok, true, 'Le JSON avec markdown et trailing commas doit être réparé');
  assert.strictEqual(res1.repaired, true, 'Indicateur repaired doit être true');
  assert.strictEqual(res1.data.outcome, 'success');
  assert.strictEqual(res1.data.claims.length, 1);
  console.log('-> Cas 1.1 Validé : Markdown, préambule et trailing commas réparés.');

  // Cas 1.2 : Sortie textuelle mutée mais réparable par heuristique
  const mutatedText = `
L'agent a terminé la tâche.
"outcome": "success"
"statement": "Service gRPC connecté et vérifié"
"statement": "Base de données synchronisée"
`;
  const res2 = immune.chaperoneRepairJson(mutatedText);
  assert.strictEqual(res2.ok, true, 'La sortie fragmentée doit être restaurée par heuristique');
  assert.strictEqual(res2.heuristic, true, 'L indicateur heuristic doit être true');
  assert.strictEqual(res2.data.outcome, 'success');
  assert.ok(res2.data.claims.length >= 2, 'Les claims doivent être reconstituées');
  console.log('-> Cas 1.2 Validé : Reconstruction heuristique de la protéine Chaperon.');

  console.log('=== TEST 2 : Phagocytose Codex & Signal de Douleur Inflammatoire ===');
  // Cas 2.1 : Rapport valide via phagocytose
  const codexGoodOutput = JSON.stringify({
    outcome: 'success',
    claims: [{ statement: 'Bug résolu', evidence: ['test.js'] }]
  });
  const phagGood = immune.phagocytoseCodexReport(codexGoodOutput, {
    agentName: 'Ablaye', nameMeaning: 'Père de la multitude', role: 'developer'
  });
  assert.strictEqual(phagGood.ok, true);
  assert.strictEqual(phagGood.report.author.name, 'Ablaye');
  console.log('-> Cas 2.1 Validé : Phagocytose et injection author.');

  // Cas 2.2 : Mutation irrécupérable (Apoptose + Signal de Douleur)
  const hopelessText = 'Erreur interne non structurée 0x88FFAA #!$*';
  const phagFail = immune.phagocytoseCodexReport(hopelessText, {
    agentName: 'Babacar', nameMeaning: 'Porte-étendard', role: 'tester'
  });
  assert.strictEqual(phagFail.ok, false, 'Doit échouer sur texte sans structure');
  assert.ok(phagFail.painSignal.includes('[SIGNAL IMMUNITAIRE : DOULEUR COGNITIVE]'), 'Doit générer le signal de douleur');
  assert.strictEqual(phagFail.fallbackReport.outcome, 'failed');
  assert.strictEqual(phagFail.fallbackReport.failure.category, 'mutated_output');
  assert.ok(phagFail.fallbackReport.failure.reason.includes('DOULEUR COGNITIVE'));
  console.log('-> Cas 2.2 Validé : Apoptose déclarée et signal de douleur généré.');

  console.log('=== TEST 3 : Détection de Dérive Cognitive et Répétition ===');
  const repetitiveText = 'erreur erreur erreur erreur erreur erreur erreur erreur erreur boucle boucle boucle boucle';
  const drift = immune.evaluateCognitiveDrift(repetitiveText);
  assert.strictEqual(drift.warning, true, 'Une répétition excessive doit déclencher un warning de dérive');
  assert.ok(drift.health.repetition_score > 0.15, 'Score de répétition élevé');
  console.log('-> Cas 3.1 Validé : Dérive cognitive et effondrement lexical détectés.');

  console.log('=== TEST 4 : Classification et Mue Cognitive en Récupération ===');
  // Classification
  const event = {
    eventType: 'CELLULAR_APOPTOSIS',
    detail: 'Échec irrécupérable du formatage de Codex',
    payload: {
      failure: {
        category: 'mutated_output',
        reason: phagFail.painSignal
      }
    }
  };
  const classifiedCat = workerRecovery.classifyFailure(event);
  assert.strictEqual(classifiedCat, 'mutated_output', 'La catégorie doit être classifiée en mutated_output');

  // Décision de récupération
  const report = {
    category: 'mutated_output',
    reason: phagFail.painSignal,
    mission: 'Créer le composant UI',
    attempt: 0,
    maxAttempts: 3,
    evidence: []
  };
  const decision = workerRecovery.decideRecovery(report);
  assert.strictEqual(decision.action, 'mutate_worker', 'Doit décider une mutation de worker');
  assert.ok(decision.reason.includes('cognitive molting'), 'Doit mentionner la mue cognitive');

  // Prompt de récupération avec signal de douleur
  const prompt = workerRecovery.recoveryPrompt(report, decision);
  assert.ok(prompt.includes('INSTRUCTION DE RÉPARATION IMMUNITAIRE'), 'Doit inclure l instruction de réparation immunitaire');
  assert.ok(prompt.includes('DOULEUR COGNITIVE'), 'Doit contenir le signal de douleur');
  console.log('-> Cas 4.1 Validé : Classification de mutation, décision mutate_worker et injection du signal de douleur.');

  console.log('=== TOUS LES TESTS DU SYSTÈME IMMUNITAIRE & CHAPERON ONT RÉUSSI ===');
}

runTests().catch((err) => {
  console.error('Échec du test :', err);
  process.exit(1);
});
