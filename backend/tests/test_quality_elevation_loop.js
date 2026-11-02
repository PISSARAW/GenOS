'use strict';

const assert = require('node:assert/strict');
const {
  compileQualityContract,
  createElevationSession,
  recordIterationVersion,
  decideContinuation,
  buildRepairPrompt,
  executeElevationLoop
} = require('../src/services/qualityElevation/qualityElevationService');
const { evaluateContent } = require('../src/services/qualityElevation/qualityEvaluatorRegistry');
const { detectStagnation } = require('../src/services/qualityElevation/qualityStagnationDetector');
const { compareVersions } = require('../src/services/qualityElevation/qualityComparisonService');
const { enforceQualityContract } = require('../src/services/qualityElevation/workerQualityContractEnforcer');
const { createRepairObligation, validateMemberEvidence } = require('../src/services/aTeam/execution/teamEvidenceService');

function testContractCompilation() {
  const contractFast = compileQualityContract({ policy: 'fast', domain: 'creative_writing' });
  assert.equal(contractFast.maxIterations, 2);
  assert.equal(contractFast.minQualityScore, 70);
  assert.equal(contractFast.requireDoubleBlind, false);

  const contractCrit = compileQualityContract({ policy: 'critical', domain: 'software_engineering' });
  assert.equal(contractCrit.maxIterations, 5);
  assert.equal(contractCrit.minQualityScore, 95);
  assert.equal(contractCrit.requireDoubleBlind, true);

  const custom = compileQualityContract({ maxIterations: 4, minQualityScore: 88 });
  assert.equal(custom.maxIterations, 4);
  assert.equal(custom.minQualityScore, 88);
}

function testCreativeWritingEvaluator() {
  const rawText = 'Une histoire sans structure.';
  const evalRaw = evaluateContent('creative_writing', rawText);
  assert.equal(evalRaw.valid, false);
  assert.ok(evalRaw.defects.length >= 4);

  const structuredText = `
PRÉMISSE DRAMATIQUE:
Un détective recherche son frère disparu dans une station orbitale.

PERSONNAGES:
- **Alain**: Officier loyal. Secret: il cache une infection. Objectif: sauver son frère.
- **Vera**: Scientifique rebelle. Secret: responsable de la fuite. Objectif: fuir la station.

SÉQUENCIER DE SCÈNES CLÉS:
Scène 1: Découverte de l'alerte de confinement.
Scène 2: Confrontation dans les coursives.
Scène 3: Sabotage du sas de dépressurisation.

INT. POSTE DE COMMANDEMENT - JOUR
Alain: Où est mon frère ?
Vera: Tu ne comprendrais pas ce qu'il a découvert.
Alain: Réponds avant que je ne verrouille les issues.
Vera: C'est déjà trop tard pour nous deux.

NOTE DRAMATURGIQUE:
Le conflit principal oppose devoir institutionnel et survie fraternelle, créant une tension croissante jusqu'au dénouement.
`;
  const evalGood = evaluateContent('creative_writing', structuredText);
  assert.equal(evalGood.valid, true);
  assert.ok(evalGood.overallScore >= 80);
  assert.equal(evalGood.defects.length, 0);
}

function testSoftwareEngineeringEvaluator() {
  const badSyntax = 'function broken( { return 42;';
  const evalSyntax = evaluateContent('software_engineering', badSyntax);
  assert.equal(evalSyntax.valid, false);
  assert.ok(evalSyntax.defects.some((d) => d.code === 'SYNTAX_ERROR'));

  const badSecurity = 'const cp = require("child_process"); cp.exec("rm -rf " + input);';
  const evalSec = evaluateContent('software_engineering', badSecurity);
  assert.equal(evalSec.valid, false);
  assert.ok(evalSec.defects.some((d) => d.code === 'SECURITY_INSECURE_SHELL_EXEC'));

  const cleanCode = `
function computeDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}
module.exports = { computeDistance };
// Test: computeDistance(0,0,3,4) === 5
`;
  const evalClean = evaluateContent('software_engineering', cleanCode, { requiredExports: ['computeDistance'] });
  assert.equal(evalClean.valid, true);
  assert.ok(evalClean.overallScore >= 90);
}

function testComparisonAndStagnation() {
  const v1 = { iteration: 1, defects: [{ code: 'SYNTAX_ERROR' }, { code: 'NO_TESTS' }], overallScore: 40 };
  const v2 = { iteration: 2, defects: [{ code: 'NO_TESTS' }], overallScore: 70 };
  const diff = compareVersions(v1, v2);

  assert.equal(diff.scoreDelta, 30);
  assert.deepEqual(diff.resolvedDefectCodes, ['SYNTAX_ERROR']);
  assert.deepEqual(diff.introducedDefectCodes, []);

  const historyStagnant = [
    { defects: [{ code: 'NO_TESTS' }], content: 'code a' },
    { defects: [{ code: 'NO_TESTS' }], content: 'code b' }
  ];
  const stag1 = detectStagnation(historyStagnant, 2);
  assert.equal(stag1.stagnant, true);
  assert.ok(stag1.reason.includes('DEFECT_SIGNATURE_PERSISTED'));

  const historyEvolving = [
    { defects: [{ code: 'NO_TESTS' }, { code: 'A' }], content: 'code a' },
    { defects: [{ code: 'NO_TESTS' }], content: 'code b' }
  ];
  const stag2 = detectStagnation(historyEvolving, 2);
  assert.equal(stag2.stagnant, false);
}

async function testElevationLoopProgression() {
  const contract = compileQualityContract({ policy: 'balanced', domain: 'software_engineering', minQualityScore: 85 });
  const session = createElevationSession(contract);

  let iterationCount = 0;
  const generator = async ({ iteration, repairPrompt }) => {
    iterationCount++;
    if (iteration === 1) {
      return 'function calc() { return 1; }';
    }
    return `
function calc(a, b) {
  return a + b;
}
module.exports = { calc };
// Test: calc(2, 3) === 5
`;
  };

  const finalResult = await executeElevationLoop({
    contract,
    session,
    initialContent: '',
    generator
  });

  assert.equal(finalResult.promoted, true);
  assert.equal(finalResult.bestVersion.version, 2);
  assert.ok(finalResult.bestVersion.score >= 85);
  assert.ok(finalResult.session.versions.length === 2);
}

function testWorkerQualityContractEnforcement() {
  const workerWithContract = {
    agentId: 'author-agent',
    workerContract: {
      qualityElevation: {
        domain: 'creative_writing',
        minScore: 75
      }
    }
  };

  const invalidReport = { output: 'Rien du tout.' };
  assert.throws(() => {
    enforceQualityContract(workerWithContract, invalidReport, null);
  }, /failed quality elevation contract/);

  const workerWithoutContract = {
    agentId: 'plain-agent',
    workerContract: {}
  };
  assert.equal(enforceQualityContract(workerWithoutContract, invalidReport, null), null);
}

function testTeamEvidenceRepairObligation() {
  const member = { memberId: 'writer-1', acceptanceCriteria: ['criterion-A', 'criterion-B'] };
  const obligation = createRepairObligation(member, ['criterion-B']);
  assert.equal(obligation.memberId, 'writer-1');
  assert.equal(obligation.status, 'pending_repair');
  assert.deepEqual(obligation.unverifiedCriteria, ['criterion-B']);

  const unbackedDossier = {
    events: [{
      evidenceReport: {
        outcome: 'success',
        claims: [{ statement: 'done', evidence: ['ev-1'] }],
        acceptanceEvaluations: [{ criterion: 'criterion-A', passed: true, evidenceRefs: ['ev-1'] }]
      }
    }]
  };
  const verdict = validateMemberEvidence(member, unbackedDossier);
  assert.equal(verdict.promoted, false);
  assert.equal(verdict.reason, 'acceptance_criteria_unverified');
  assert.ok(verdict.repairObligation);
  assert.deepEqual(verdict.repairObligation.unverifiedCriteria, ['criterion-B']);
}

async function runAllTests() {
  testContractCompilation();
  testCreativeWritingEvaluator();
  testSoftwareEngineeringEvaluator();
  testComparisonAndStagnation();
  await testElevationLoopProgression();
  testWorkerQualityContractEnforcement();
  testTeamEvidenceRepairObligation();
  console.log('GQEL (GenOS Quality Elevation Loop) comprehensive test suite passed.');
}

runAllTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
