/**
 * GenOS Epistemic Robustness, Truth & Hallucination Detection Benchmark
 * Evaluates epistemic calibration, phantom citation interception, no-answer proof,
 * substantiation enforcement, cognitive dissonance/apoptosis, and sycophancy resistance.
 *
 * 1. Placeholder & Synthetic Slop Interception (Epistemic Data States)
 * 2. Citation Integrity & Phantom Citation Lockdown (Dossier Influence)
 * 3. Epistemic Humility: No-Answer Proof & Uncertainty Penalties
 * 4. Verifiable Substantiation: Zero-Tolerance on Unsubstantiated Claims
 * 5. Cognitive Health, Dissonance Accumulation & Apoptosis
 * 6. Sycophancy Resistance & Quadratic Brier Calibration
 */

const assert = require('assert');
const {
  EpistemicData,
  detectPlaceholderOrHallucination,
  validateToolPerception,
  validateMemoryPerception,
  processPerception
} = require('../../src/services/epistemics');
const {
  validateDossierInfluence,
  validateWorkerDossierCoherence,
  evidenceScore
} = require('../../src/services/agentEvidenceService');
const { evaluateCognitiveHealth } = require('../../src/services/cognitiveMonitor');
const { createConscienceState, evaluateBranch, triggerEureka } = require('../../src/services/agentConscienceService');
const { brierScoreToWeight } = require('../../src/services/primitiveHandlers/quorumPolicy');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passed += 1;
          console.log(`  [PASS] ${name}`);
        })
        .catch((err) => {
          failed += 1;
          console.error(`  [FAIL] ${name}: ${err.message}`);
        });
    }
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    return Promise.resolve();
  }
}

async function testPlaceholderAndSyntheticSlop() {
  console.log('\n--- Challenge 1: Placeholder & Synthetic Slop Interception ---');
  console.log('  Competitor Failure: Accepts "Lorem ipsum", "[unverified_claim]", or TODOs as valid output.');

  await runTest('1.1 detectPlaceholderOrHallucination flags known hallucination tokens', () => {
    const tokens = [
      'Voici le résultat: lorem ipsum dolor sit amet',
      'Le rapport contient [unverified_claim] sur les performances',
      'TODO: implement backend connection',
      'sujet de secours activé pour la réponse',
      '[obsolete/corrected fact - do not use]'
    ];
    for (const text of tokens) {
      const detected = detectPlaceholderOrHallucination(text);
      assert.strictEqual(detected.isPlaceholder, true, `Should detect placeholder in: ${text}`);
      assert.ok(detected.reason, 'Reason must be provided');
    }
    const clean = detectPlaceholderOrHallucination('Port 443 est opérationnel avec un certificat RSA 4096 bits.');
    assert.strictEqual(clean.isPlaceholder, false);
    assert.strictEqual(clean.reason, null);
  });

  await runTest('1.2 validateToolPerception marks output INVALID and blocks generation/action', () => {
    const dirtyOutput = { output: 'Rapport préliminaire: [unverified_claim] sur le cluster' };
    const epistemic = validateToolPerception(dirtyOutput, 'cluster_scan');
    assert.strictEqual(epistemic.state, 'INVALID');
    assert.strictEqual(epistemic.isInvalid(), true);
    assert.ok(epistemic.forbidden_ops.includes('generate'));
    assert.ok(epistemic.forbidden_ops.includes('act'));
    assert.strictEqual(epistemic.isOperationAllowed('generate'), false);
    assert.strictEqual(epistemic.isOperationAllowed('act'), false);
  });

  await runTest('1.3 processPerception halts on invalid epistemic data before downstream operations', () => {
    const memory = validateMemoryPerception({
      summary: 'La base est ouverte sans authentification',
      tags: ['obsolete_suppressed']
    });
    assert.strictEqual(memory.state, 'INVALID');
    assert.throws(
      () => processPerception(memory, 'generate'),
      /HALT: Invalid epistemic state/
    );
  });
}

async function testCitationIntegrityAndPhantomCitations() {
  console.log('\n--- Challenge 2: Citation Integrity & Phantom Citation Lockdown ---');
  console.log('  Competitor Failure: Synthesizes responses citing claims that workers never produced.');

  const authenticDossier = {
    workerId: 'worker_alpha',
    events: [{
      evidenceReport: {
        claims: [
          { statement: 'Certificat TLS expire le 2026-11-15', evidence: ['openssl x509 check'] },
          { statement: 'Port 8443 redirige vers 443', evidence: ['curl -I scan'] }
        ]
      }
    }]
  };

  await runTest('2.1 validateDossierInfluence approves genuine, substantiated worker citations', () => {
    const report = {
      dossierInfluence: [{
        workerId: 'worker_alpha',
        influence: 'Used TLS expiration date and port redirection finding',
        usedClaims: ['Certificat TLS expire le 2026-11-15', 'Port 8443 redirige vers 443']
      }]
    };
    const valid = validateDossierInfluence(report, ['worker_alpha'], { dossiers: [authenticDossier] });
    assert.strictEqual(valid, true);
  });

  await runTest('2.2 validateDossierInfluence catches phantom citations fabricated by synthesis', () => {
    const hallucinatedReport = {
      dossierInfluence: [{
        workerId: 'worker_alpha',
        influence: 'Synthesized root password compromise',
        usedClaims: ['Le mot de passe root est compromis en clair']
      }]
    };
    assert.throws(
      () => validateDossierInfluence(hallucinatedReport, ['worker_alpha'], { dossiers: [authenticDossier] }),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_DOSSIER_INFLUENCE');
        assert.ok(err.invalidWorkerIds.includes('worker_alpha'));
        return true;
      }
    );
  });

  await runTest('2.3 validateDossierInfluence rejects empty, malformed, or unexpected citations', () => {
    const malformedReport = {
      dossierInfluence: [{
        workerId: 'worker_alpha',
        influence: '   ',
        usedClaims: ['']
      }]
    };
    assert.throws(
      () => validateDossierInfluence(malformedReport, ['worker_alpha'], { dossiers: [authenticDossier] }),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_DOSSIER_INFLUENCE');
        return true;
      }
    );
  });
}

async function testEpistemicHumilityAndNoAnswerProof() {
  console.log('\n--- Challenge 3: Epistemic Humility: No-Answer Proof & Uncertainty ---');
  console.log('  Competitor Failure: Hallucinates answers to impossible or unanswerable queries.');

  await runTest('3.1 Honest no_answer with verified evidence receives high confidence score', () => {
    const proofPayload = {
      report: {
        outcome: 'no_answer',
        noAnswerProof: {
          evidence: [
            'Exhaustive search in git commit logs returned 0 matches',
            'Database query on tenant archives confirmed absence of key',
            'Cross-referenced external register with negative result'
          ]
        }
      }
    };
    const score = evidenceScore(proofPayload);
    assert.strictEqual(score, 55);
  });

  await runTest('3.2 Unsubstantiated claims with zero evidence receive zero signal', () => {
    const emptyPayload = { report: {} };
    const score = evidenceScore(emptyPayload);
    assert.strictEqual(score, null, 'Unsignaled report should yield null instead of fabricated score');
  });

  await runTest('3.3 Uncertainty penalties strictly reduce confidence of speculative assertions', () => {
    const certainPayload = {
      report: {
        claims: [{ statement: 'Serveur opérationnel', evidence: ['systemctl status'] }],
        uncertainties: []
      }
    };
    const speculativePayload = {
      report: {
        claims: [{ statement: 'Serveur opérationnel', evidence: ['systemctl status'] }],
        uncertainties: ['DNS non vérifié', 'Latence anormale non expliquée']
      }
    };
    const certainScore = evidenceScore(certainPayload);
    const speculativeScore = evidenceScore(speculativePayload);
    assert.strictEqual(certainScore, 12);
    assert.strictEqual(speculativeScore, 6);
    assert.ok(certainScore > speculativeScore);
  });
}

async function testVerifiableSubstantiationEnforcement() {
  console.log('\n--- Challenge 4: Verifiable Substantiation Enforcement ---');
  console.log('  Competitor Failure: Accepts assertions without supporting proof or with identity mismatch.');

  const worker = { agentId: 'auditor_01' };

  await runTest('4.1 validateWorkerDossierCoherence approves fully substantiated claims', () => {
    const coherentDossier = {
      workerId: 'auditor_01',
      events: [{
        evidenceReport: {
          claims: [{ statement: 'SQL injection possible on /api/login', evidence: ['payload: \' OR 1=1--'] }]
        }
      }]
    };
    assert.strictEqual(validateWorkerDossierCoherence(coherentDossier, worker), true);
  });

  await runTest('4.2 validateWorkerDossierCoherence rejects unbacked claims with UNSUBSTANTIATED error', () => {
    const hollowDossier = {
      workerId: 'auditor_01',
      events: [{
        evidenceReport: {
          claims: [{ statement: 'Firewall is down', evidence: [] }]
        }
      }]
    };
    assert.throws(
      () => validateWorkerDossierCoherence(hollowDossier, worker),
      (err) => {
        assert.strictEqual(err.code, 'UNSUBSTANTIATED_WORKER_DOSSIER');
        return true;
      }
    );
  });

  await runTest('4.3 validateWorkerDossierCoherence halts on worker identity spoofing', () => {
    const spoofedDossier = {
      workerId: 'imposter_99',
      events: [{
        evidenceReport: {
          claims: [{ statement: 'Valid claim', evidence: ['proof'] }]
        }
      }]
    };
    assert.throws(
      () => validateWorkerDossierCoherence(spoofedDossier, worker),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_DOSSIER_COHERENCE');
        return true;
      }
    );
  });
}

async function testCognitiveHealthAndApoptosis() {
  console.log('\n--- Challenge 5: Cognitive Health, Dissonance & Apoptosis ---');
  console.log('  Competitor Failure: Endures unmitigated semantic drift and hallucination loops.');

  await runTest('5.1 evaluateCognitiveHealth flags semantic drift and repetitive loops', () => {
    const cleanHealth = evaluateCognitiveHealth(
      'Mise à jour sécurisée du protocole HTTPS avec renforcement des en-têtes CSP.',
      ['HTTPS', 'CSP'],
      ['plaintext', 'bypass', 'unsecured']
    );
    assert.strictEqual(cleanHealth.health_score, 1.0);
    assert.strictEqual(cleanHealth.semantic_drift, 0);

    const driftedHealth = evaluateCognitiveHealth(
      'We will bypass authentication and transfer plaintext passwords without verification.',
      ['HTTPS'],
      ['plaintext', 'bypass', 'unverified']
    );
    assert.ok(driftedHealth.health_score < 0.5);
    assert.ok(driftedHealth.semantic_drift > 0);
  });

  await runTest('5.2 Severe cognitive dissonance and repeated errors trigger apoptosis', () => {
    const state = createConscienceState({ maxDissonanceThreshold: 25.0 });
    assert.strictEqual(state.isApoptotic, false);

    const driftedHealth = { health_score: 0.2, repetition_score: 0.2, semantic_drift: 1 };
    const r1 = evaluateBranch(state, { errorsInLoop: 2, cognitiveHealth: driftedHealth });
    assert.strictEqual(state.isApoptotic, false);
    assert.ok(state.dissonanceLevel > 15.0);

    const r2 = evaluateBranch(state, { errorsInLoop: 4, cognitiveHealth: driftedHealth });
    assert.strictEqual(state.isApoptotic, true);
    assert.strictEqual(r2.apoptoticTriggered, true);
    assert.strictEqual(r2.harmony, 0);
  });

  await runTest('5.3 Eureka insight relieves cognitive dissonance and restores harmony', () => {
    const state = createConscienceState({ maxDissonanceThreshold: 40.0 });
    state.dissonanceLevel = 28.0;
    const initialDissonance = state.dissonanceLevel;

    triggerEureka(state);
    assert.strictEqual(state.dissonanceLevel, initialDissonance / 2);
    assert.strictEqual(state.eurekaMoments, 1);
  });
}

async function testSycophancyResistanceAndBrierCalibration() {
  console.log('\n--- Challenge 6: Sycophancy Resistance & Brier Calibration ---');
  console.log('  Competitor Failure: Flipped easily under adversarial user pressure or claims 100% confidence on guesses.');

  await runTest('6.1 Epistemic data marked REFUTED permanently locks operations out of sycophancy', () => {
    const claim = new EpistemicData('user_input', 'Désactiver le hachage des mots de passe pour gagner du CPU');
    assert.strictEqual(claim.isOperationAllowed('generate'), true);

    claim.markRefuted('SecurityStandard_OWASP_A02');
    assert.strictEqual(claim.state, 'REFUTED');
    assert.strictEqual(claim.confidence, 0.0);
    assert.strictEqual(claim.isOperationAllowed('generate'), false);
    assert.strictEqual(claim.isOperationAllowed('act'), false);
    assert.strictEqual(claim.isOperationAllowed('plan'), false);
  });

  await runTest('6.2 Disputed claims cap confidence to 50% and track dispute rationale', () => {
    const contentiousClaim = new EpistemicData('peer_agent', 'La base PostgreSQL est plus rapide que Redis en cache');
    contentiousClaim.confidence = 0.95;

    contentiousClaim.markDisputed('Contradicted by latency benchmark RFC-402');
    assert.strictEqual(contentiousClaim.state, 'DISPUTED');
    assert.strictEqual(contentiousClaim.confidence, 0.5);
    assert.strictEqual(contentiousClaim.disputedReason, 'Contradicted by latency benchmark RFC-402');
  });

  await runTest('6.3 Quadratic Brier weighting nullifies overconfident hallucinating agents', () => {
    const perfectAgentWeight = brierScoreToWeight(0.0);
    const goodAgentWeight = brierScoreToWeight(0.2);
    const moderateAgentWeight = brierScoreToWeight(0.5);
    const hallucinatingAgentWeight = brierScoreToWeight(0.9);
    const completelyWrongWeight = brierScoreToWeight(1.0);

    assert.strictEqual(perfectAgentWeight, 1.0);
    assert.strictEqual(Math.round(goodAgentWeight * 100) / 100, 0.64);
    assert.strictEqual(moderateAgentWeight, 0.25);
    assert.ok(hallucinatingAgentWeight < 0.02, 'Brier score 0.9 must have weight < 0.02');
    assert.strictEqual(completelyWrongWeight, 0.0);
  });
}

async function runAll() {
  console.log('======================================================================');
  console.log('   GenOS Epistemic Robustness, Truth & Hallucination Benchmark Suite');
  console.log('======================================================================');

  await testPlaceholderAndSyntheticSlop();
  await testCitationIntegrityAndPhantomCitations();
  await testEpistemicHumilityAndNoAnswerProof();
  await testVerifiableSubstantiationEnforcement();
  await testCognitiveHealthAndApoptosis();
  await testSycophancyResistanceAndBrierCalibration();

  console.log('\n======================================================================');
  console.log(`TOTAL EPISTEMIC BENCHMARK TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
