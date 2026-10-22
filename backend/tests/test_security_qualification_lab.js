'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
const {
  CC001_TRUST_POLICY,
  buildCcGenos001DeoArtifacts
} = require('../src/services/securityQualificationLab/ccGenos001FixturesAndStages');
const perceptionService = require('../src/services/securityPerception/securityPerceptionService');
const {
  qualifyShreIsolatedVmCycle
} = require('../src/services/cyberCorpActionGateway/cyberCorpActuators');

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

function createInMemoryStateDb() {
  const rows = new Map();
  return {
    get: async (_sql, scope, key) => rows.get(`${scope}::${key}`) || null,
    run: async (...args) => {
      const [sql, scope, key, payloadJson] = args;
      if (String(sql).includes('adaptive_state_events')) return;
      rows.set(`${scope}::${key}`, { payload_json: payloadJson });
    }
  };
}

async function testAutonomousPerceptionMultiWindowChain() {
  const db = createInMemoryStateDb();
  const tenant = { organizationId: 'cybercorp', projectId: 'cc-genos-001' };
  const deoArtifacts = buildCcGenos001DeoArtifacts();

  const campaign = await perceptionService.runImmuneSurveillanceCampaign(db, tenant, {
    sensors: [
      { id: 'sensor:pfsense-edge-01', kind: 'network', quality: 0.95 },
      { id: 'sensor:zeek-dmz-01', kind: 'network', quality: 0.9 }
    ],
    investigator: {
      investigate: async ({ windowId, observation, evidenceRefs }) => ({
        status: 'candidate',
        id: `candidate-${windowId}`,
        producerId: 'fixture-investigator',
        evidenceRefs,
        summary: `Synthetic investigation candidate for ${observation.subject}`
      })
    },
    verifier: {
      verify: async ({ candidate }) => ({
        status: 'verified',
        independent: true,
        verifierId: 'fixture-independent-verifier',
        evidenceRefs: candidate.evidenceRefs,
        receipt: { id: `receipt-${candidate.id}` },
        report: { verified: true }
      })
    },
    windows: [
      {
        windowId: 'win-01-baseline-normal',
        observation: {
          sensorId: 'sensor:pfsense-edge-01',
          subject: 'srv-fin-02.cybercorp.local',
          signal: 'smb_port_445_state',
          value: 'filtered',
          facts: ['baseline_normal_port_filtered'],
          observedAt: '2026-10-22T07:00:00Z',
          confirmedNormal: true,
          budget: 2
        }
      },
      {
        windowId: 'win-02-baseline-normal',
        observation: {
          sensorId: 'sensor:pfsense-edge-01',
          subject: 'srv-fin-02.cybercorp.local',
          signal: 'smb_port_445_state',
          value: 'filtered',
          facts: ['baseline_normal_port_filtered_2'],
          observedAt: '2026-10-22T08:00:00Z',
          confirmedNormal: true,
          budget: 2
        }
      },
      {
        windowId: 'win-03-baseline-normal',
        observation: {
          sensorId: 'sensor:pfsense-edge-01',
          subject: 'srv-fin-02.cybercorp.local',
          signal: 'smb_port_445_state',
          value: 'filtered',
          facts: ['baseline_normal_port_filtered_3'],
          observedAt: '2026-10-22T09:00:00Z',
          confirmedNormal: true,
          budget: 2
        }
      },
      {
        windowId: 'win-04-anomaly-pfsense-exception',
        evidenceArtifacts: deoArtifacts,
        trustPolicy: CC001_TRUST_POLICY,
        calibrationCorrect: true,
        observation: {
          sensorId: 'sensor:pfsense-edge-01',
          subject: 'srv-fin-02.cybercorp.local',
          signal: 'smb_port_445_state',
          value: 'open',
          facts: ['pfsense_rule_TEMP-WAN-DMZ-445_active', 'evtx_4624_5140_admin_share'],
          signals: ['port_445_open_deviation', 'outbound_smb_rundll32'],
          ruleMatches: ['sigma_outbound_smb_rundll32'],
          observedAt: '2026-10-22T09:41:15Z',
          risk: 0.9,
          budget: 3
        }
      },
      {
        windowId: 'win-05-silent-sensor-abstention',
        observation: {
          sensorId: 'sensor:zeek-dmz-01',
          subject: 'srv-fin-02.cybercorp.local',
          signal: 'dns_telemetry',
          value: 'unknown',
          observedAt: '2026-10-22T09:50:00Z',
          budget: 2
        }
      }
    ]
  });

  assert.equal(campaign.windowCount, 5);
  assert.equal(campaign.benignWindowCount, 3);
  assert.equal(campaign.verifiedInvestigationCount, 1);
  assert.equal(campaign.verifiedReportCount, 1);
  assert.equal(campaign.abstainedWindowCount, 1);
  assert.equal(campaign.persistedInvestigationCount, 1);
  assert.equal(campaign.persistedIncidentCount, 1);

  const anomalyWin = campaign.windows[3];
  assert.equal(anomalyWin.collection.evidenceOrganUsed, true);
  assert.equal(anomalyWin.collection.artifactCount, 5);
  assert.equal(anomalyWin.triggered, true);
  assert.equal(anomalyWin.verification.id, 'receipt-candidate-win-04-anomaly-pfsense-exception');
  assert.equal(anomalyWin.report.verified, true);
  assert.equal(anomalyWin.decisionOutcome, 'verified-investigation');
}

async function testQualifiedSandboxAndLowRiskPfSenseActuators() {
  const db = createInMemoryStateDb();
  const tenant = { organizationId: 'cybercorp', projectId: 'shre-actuator-qual' };
  const shreResult = await qualifyShreIsolatedVmCycle(db, tenant);

  assert.equal(shreResult.finalStatus, 'CLOSED');
  assert.equal(shreResult.causalVerificationStatus, 'PASS');
  assert.equal(shreResult.stateMutatedOnApply, true);
  assert.equal(shreResult.exactRollbackVerified, true);
}


async function runAllTests() {
  testC0ToC5QualificationReferentiel();
  testDossierCompletenessAndVerification();
  testCorpusCategoriesAndOutcomeClassifications();
  testReplayDriftDetectionAndCampaignSummary();
  await testAutonomousPerceptionMultiWindowChain();
  await testQualifiedSandboxAndLowRiskPfSenseActuators();
  console.log('PASS test_security_qualification_lab');
}

runAllTests();
