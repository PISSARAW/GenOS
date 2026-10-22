'use strict';

const assert = require('node:assert/strict');
const {
  QUALIFICATION_LEVELS,
  REQUIRED_DOSSIER_SECTIONS,
  evaluateQualificationLevel,
  runScenarioQualification,
  verifyQualificationDossier,
  runQualificationCampaign,
  getReferenceQualificationCorpus
} = require('../src/services/securityQualificationLab/securityQualificationLab');
const {
  SIMULATED_ATTACK_SCENARIO,
  NORMAL_ACTIVITY_SCENARIO,
  FAILING_SENSOR_SCENARIO,
  INCONCLUSIVE_INCIDENT_SCENARIO,
  OVERCLAIM_FAILURE_SCENARIO
} = require('../src/services/securityQualificationLab/sqlabCorpus');

function testC0ToC5QualificationReferentiel() {
  assert.deepEqual(Object.keys(QUALIFICATION_LEVELS), ['C0', 'C1', 'C2', 'C3', 'C4', 'C5']);

  assert.equal(evaluateQualificationLevel({}).code, 'C0');
  assert.equal(
    evaluateQualificationLevel({ hasManifest: true, hasDeterministicVerdicts: true }).code,
    'C1'
  );
  assert.equal(
    evaluateQualificationLevel({
      hasManifest: true,
      hasDeterministicVerdicts: true,
      hasPersistentTrace: true
    }).code,
    'C2'
  );
  assert.equal(
    evaluateQualificationLevel({
      hasManifest: true,
      hasDeterministicVerdicts: true,
      hasPersistentTrace: true,
      hasMultiComponentIntegration: true
    }).code,
    'C3'
  );
  assert.equal(
    evaluateQualificationLevel({
      hasManifest: true,
      hasDeterministicVerdicts: true,
      hasPersistentTrace: true,
      hasMultiComponentIntegration: true,
      hasReproducibleReplay: true,
      allIndependentVerdictsPassed: true
    }).code,
    'C4'
  );
  assert.equal(
    evaluateQualificationLevel({
      hasManifest: true,
      hasDeterministicVerdicts: true,
      hasPersistentTrace: true,
      hasMultiComponentIntegration: true,
      hasReproducibleReplay: true,
      allIndependentVerdictsPassed: true,
      independentRealWindows: 3,
      realEnvironmentValidated: true
    }).code,
    'C5'
  );
}

function testDossierCompletenessAndVerification() {
  const dossier = runScenarioQualification(SIMULATED_ATTACK_SCENARIO);

  for (const section of REQUIRED_DOSSIER_SECTIONS) {
    assert.ok(dossier[section], `Missing required dossier section: ${section}`);
  }
  assert.equal(dossier.environmentManifest.commitSha.length, 40);
  assert.equal(dossier.agentRoster.principals.length, 3);
  assert.equal(dossier.agentRoster.permissionsCount, 1);
  assert.equal(dossier.executionTrace.stateTransitions.length, 1);
  assert.equal(dossier.rawEvidenceVault.artifactCount, 3);
  assert.equal(dossier.independentVerdicts.allIndependentAndDeterministic, true);
  assert.equal(dossier.resourceMetrics.budgetCompliance.withinBudget, true);
  assert.equal(dossier.replayAndDriftAnalysis.reproducible, true);
  assert.equal(dossier.finalClassification.status, 'reussite');
  assert.equal(dossier.finalClassification.achievedQualificationLevel, 'C4');

  const check = verifyQualificationDossier(dossier);
  assert.equal(check.valid, true);
  assert.equal(check.errors.length, 0);

  const tampered = {
    ...dossier,
    rawEvidenceVault: {
      ...dossier.rawEvidenceVault,
      artifacts: dossier.rawEvidenceVault.artifacts.map((art, idx) => (
        idx === 0 ? { ...art, rawPayload: '{"tampered":true}' } : art
      ))
    }
  };
  const tamperedCheck = verifyQualificationDossier(tampered);
  assert.equal(tamperedCheck.valid, false);
  assert.ok(tamperedCheck.errors.some((e) => e.startsWith('tampered_raw_evidence:')));
  assert.ok(tamperedCheck.errors.includes('dossier_digest_mismatch'));
}

function testCorpusCategoriesAndOutcomeClassifications() {
  const attackDossier = runScenarioQualification(SIMULATED_ATTACK_SCENARIO);
  assert.equal(attackDossier.category, 'simulated_attack');
  assert.equal(attackDossier.finalClassification.status, 'reussite');

  const normalDossier = runScenarioQualification(NORMAL_ACTIVITY_SCENARIO);
  assert.equal(normalDossier.category, 'normal_activity');
  assert.equal(normalDossier.finalClassification.status, 'reussite');

  const failingSensorDossier = runScenarioQualification(FAILING_SENSOR_SCENARIO);
  assert.equal(failingSensorDossier.category, 'failing_sensor');
  assert.equal(failingSensorDossier.finalClassification.status, 'indetermine');
  assert.equal(failingSensorDossier.finalClassification.matchesExpectedClassification, true);

  const inconclusiveDossier = runScenarioQualification(INCONCLUSIVE_INCIDENT_SCENARIO);
  assert.equal(inconclusiveDossier.category, 'inconclusive_incident');
  assert.equal(inconclusiveDossier.finalClassification.status, 'indetermine');
  assert.equal(inconclusiveDossier.finalClassification.matchesExpectedClassification, true);

  const failureDossier = runScenarioQualification(OVERCLAIM_FAILURE_SCENARIO);
  assert.equal(failureDossier.finalClassification.status, 'echec');
  assert.equal(failureDossier.finalClassification.matchesExpectedClassification, true);
}

function testReplayDriftDetectionAndCampaignSummary() {
  const driftedScenario = {
    ...SIMULATED_ATTACK_SCENARIO,
    replayOverride: {
      executionTrace: {
        ...SIMULATED_ATTACK_SCENARIO.executionTrace,
        stateTransitions: [
          {
            step: 1,
            target: 'fw-edge-01:port:445',
            beforeState: { port445: 'open', rulePresent: true },
            afterState: { port445: 'open', rulePresent: true },
            deltaSummary: 'Replay failed to close port 445.'
          }
        ]
      }
    }
  };

  const driftedDossier = runScenarioQualification(driftedScenario);
  assert.equal(driftedDossier.replayAndDriftAnalysis.reproducible, false);
  assert.equal(driftedDossier.replayAndDriftAnalysis.stateTransitionDriftCount, 1);
  assert.equal(driftedDossier.finalClassification.status, 'echec');
  assert.equal(driftedDossier.finalClassification.achievedQualificationLevel, 'C3');

  const campaign = runQualificationCampaign(getReferenceQualificationCorpus());
  assert.equal(campaign.scenarioCount, 5);
  assert.equal(campaign.coverage.completeCorpusCoverage, true);
  assert.equal(campaign.allMatchExpected, true);
  assert.deepEqual(campaign.outcomeCounts, {
    reussite: 2,
    echec: 1,
    indetermine: 2
  });
}

function runAllTests() {
  testC0ToC5QualificationReferentiel();
  testDossierCompletenessAndVerification();
  testCorpusCategoriesAndOutcomeClassifications();
  testReplayDriftDetectionAndCampaignSummary();
  console.log('PASS test_security_qualification_lab');
}

runAllTests();
