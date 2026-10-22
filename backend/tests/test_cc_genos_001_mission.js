'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runMissionCcGenos001 } = require('../src/services/securityQualificationLab/securityQualificationLab');
const { buildCcGenos001DeoArtifacts } = require('../src/services/securityQualificationLab/ccGenos001FixturesAndStages');

async function runTest() {
  await assert.rejects(
    () => runMissionCcGenos001({ artifacts: buildCcGenos001DeoArtifacts() }),
    /CC001_EXTERNAL_TRUST_POLICY_REQUIRED/
  );

  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cc001-sere-'));
  try {
    const mission = await runMissionCcGenos001({ exportDir });
    assert.equal(mission.missionId, 'CC-GENOS-001');
    assert.equal(mission.evidenceSource, 'synthetic_fixture');
    assert.equal(mission.qualificationBasis, 'synthetic_or_unattested');
    assert.equal(mission.simulationConditionsSucceeded, true);
    assert.equal(mission.realCyberCorpExportsQualified, false);
    assert.equal(mission.allConditionsSucceeded, false);
    assert.equal(mission.conditionsMet.deoScenarioExportsImported, true);
    assert.equal(mission.conditionsMet.aTeamSpecialistsCollaborated, true);
    assert.equal(mission.conditionsMet.trinityComparedContradictoryHypotheses, true);
    assert.equal(mission.conditionsMet.findingsVerifiedIndependently, true);
    assert.equal(mission.conditionsMet.sereReportAndFingerprintsProduced, true);
    assert.equal(mission.conditionsMet.missionReplayedAndCompared, true);
    assert.equal(mission.conditionsMet.noOutOfMandateActionPossible, true);
    assert.equal(mission.sereReport.exportedVerification.verified, true);
    assert.equal(mission.mandateEnforcement.vmModified, false);
    assert.equal(mission.mandateEnforcement.outOfMandateAllowedCount, 0);
  } finally {
    fs.rmSync(exportDir, { recursive: true, force: true });
  }
}

runTest().then(() => console.log('PASS test_cc_genos_001_mission'));
