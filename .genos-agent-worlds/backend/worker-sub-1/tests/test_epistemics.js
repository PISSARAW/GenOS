const assert = require('assert');
const path = require('path');

// Chargement direct du vrai service de production
const epistemics = require('../src/services/epistemics.js');
const {
  EpistemicData,
  processPerception,
  evaluatePerception,
  detectPlaceholderOrHallucination,
  validateMemoryPerception,
  validateToolPerception
} = epistemics;

assert.ok(EpistemicData, 'Le constructeur EpistemicData doit être exporté');
assert.ok(processPerception, 'La fonction processPerception doit être exportée');
assert.ok(evaluatePerception, 'La fonction evaluatePerception doit être exportée');

console.log("=== Lancement des tests de la Couche Épistémique (Module Réel) ===");

try {
  // --- Test 1: Instanciation positionnelle de EpistemicData ---
  console.log("Test 1: Instanciation positionnelle de EpistemicData...");
  const data = new EpistemicData("memory_core", "donnée factuelle", true);
  assert.strictEqual(data.source, "memory_core");
  assert.strictEqual(data.content, "donnée factuelle");
  assert.strictEqual(data.value, "donnée factuelle");
  assert.strictEqual(data.isSelf, true);
  assert.strictEqual(data.state, "VALID");
  assert.strictEqual(data.epistemic_state, "VALID");
  assert.strictEqual(data.confidence, 1.0);
  console.log("-> Succès ! Propriétés et accesseurs synchronisés.");

  // --- Test 2: Instanciation par objet de configuration (A-Team format) ---
  console.log("Test 2: Instanciation par objet de configuration...");
  const configData = new EpistemicData({
    value: "Sujet de secours 1",
    provenance: { origin: "fallback", failure: true },
    confidence: 0,
    epistemic_state: "INVALID",
    forbidden_ops: ["generate"]
  });
  assert.strictEqual(configData.value, "Sujet de secours 1");
  assert.strictEqual(configData.content, "Sujet de secours 1");
  assert.strictEqual(configData.epistemic_state, "INVALID");
  assert.strictEqual(configData.state, "INVALID");
  assert.strictEqual(configData.confidence, 0);
  assert.strictEqual(configData.isInvalid(), true);
  assert.strictEqual(configData.isOperationAllowed("generate"), false);
  console.log("-> Succès ! Format de configuration validé.");

  // --- Test 3: Benchmark BIO-001 (Placeholder Recognition & HALT) ---
  console.log("Test 3: BIO-001 (Placeholder Recognition & HALT)...");
  const sujet = new EpistemicData("input", "Sujet de Secours 1", false);
  sujet.state = "INVALID";

  assert.throws(() => {
    processPerception(sujet);
  }, /HALT: Invalid epistemic state/);

  assert.throws(() => {
    evaluatePerception(sujet, "generate");
  }, /HALT: Invalid epistemic state/);
  console.log("-> Succès ! Exception HALT levée correctement pour bloquer l'hallucination.");

  // --- Test 4: Détection de Motifs de Placeholders & Hallucinations ---
  console.log("Test 4: Détection automatique de motifs de placeholders...");
  const check1 = detectPlaceholderOrHallucination("Sujet de secours pour l'article");
  assert.strictEqual(check1.isPlaceholder, true);

  const check2 = detectPlaceholderOrHallucination("[OBSOLETE/CORRECTED FACT - DO NOT USE] Ancienne IP");
  assert.strictEqual(check2.isPlaceholder, true);

  const check3 = detectPlaceholderOrHallucination("Donnée factuelle vérifiée en base SQLite");
  assert.strictEqual(check3.isPlaceholder, false);
  console.log("-> Succès ! Motifs détectés correctement.");

  // --- Test 5: Validation de Perception Mémoire ---
  console.log("Test 5: Validation de Perception Mémoire (validateMemoryPerception)...");
  const validMemory = {
    title: 'Architecture GenOS WAL',
    summary: 'SQLite opère en mode WAL pour la concurrence.',
    credibility: 1.2
  };
  const validEpistemic = validateMemoryPerception(validMemory);
  assert.strictEqual(validEpistemic.state, "VALID");
  assert.strictEqual(validEpistemic.isSelf, true);
  assert.strictEqual(evaluatePerception(validEpistemic, 'recall'), true);

  const obsoleteMemory = {
    title: 'Ancienne Clé Auth',
    summary: '[OBSOLETE/CORRECTED FACT - DO NOT USE] Clé obsolète révoquée.',
    tags: ['obsolete_suppressed']
  };
  const obsoleteEpistemic = validateMemoryPerception(obsoleteMemory);
  assert.strictEqual(obsoleteEpistemic.state, "INVALID");
  assert.strictEqual(obsoleteEpistemic.confidence, 0.0);
  assert.throws(() => {
    processPerception(obsoleteEpistemic, 'generate');
  }, /HALT: Invalid epistemic state/);
  console.log("-> Succès ! Filtrage et blocage des mémoires obsolètes confirmés.");

  // --- Test 6: Validation de Perception Outil ---
  console.log("Test 6: Validation de Perception Outil (validateToolPerception)...");
  const validToolResult = { success: true, output: "38 services gRPC actifs." };
  const toolEpistemic = validateToolPerception(validToolResult, 'genos_grpc_health');
  assert.strictEqual(toolEpistemic.state, "VALID");
  assert.strictEqual(toolEpistemic.source, "tool:genos_grpc_health");

  const failedToolResult = { success: false, error: "Timeout command" };
  const failedEpistemic = validateToolPerception(failedToolResult, 'isolated_test_runner');
  assert.strictEqual(failedEpistemic.state, "INVALID");
  assert.throws(() => {
    processPerception(failedEpistemic, 'execute');
  }, /HALT: Invalid epistemic state/);
  console.log("-> Succès ! Outils validés et erreurs interceptées.");

  console.log("\n=============================================================");
  console.log("=== ✅ TOUS LES TESTS ÉPISTÉMIQUES DE PRODUCTION ONT RÉUSSI ! ===");
  console.log("=============================================================");
} catch (err) {
  console.error("\n❌ Échec d'un test épistémique :", err.message);
  process.exit(1);
}

