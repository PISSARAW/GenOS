const assert = require('assert');
const hallucinationMonitor = require('../src/services/hallucinationMonitoringService');
const { validateDossierInfluence, evidenceScore } = require('../src/services/agentEvidenceService');
const { validateMemoryPerception } = require('../src/services/epistemics');
const arenaTask = require('../src/services/arenaTaskEvaluation');

async function runTests() {
  console.log('--- Running Unproven Claims Detection Integration Tests ---');

  // 1. Evidence scoring (Point 2)
  console.log('Testing evidenceScore and boundedEvidenceScore (Point 2)...');
  const emptyEvidenceScore = evidenceScore({
    evidenceReport: {
      claims: [{ statement: 'I did something', evidence: [] }, { statement: 'Another thing', evidence: ['   '] }]
    }
  });
  assert.equal(emptyEvidenceScore, 0, 'Should not award points to claims with empty/whitespace evidence');
  
  const validEvidenceScore = evidenceScore({
    evidenceReport: {
      claims: [{ statement: 'Verified fact', evidence: ['Logs confirm this'] }]
    }
  });
  assert(validEvidenceScore > 0, 'Should award points to claims with valid evidence');

  // 2. Memory context and Epistemics (Point 4)
  console.log('Testing Epistemics perception validation (Point 4)...');
  const memoryItemUnproven = validateMemoryPerception({
    content: '[UNVERIFIED_EVIDENCE] Task: test\nResult: some result',
    tags: ['unverified']
  });
  assert.equal(memoryItemUnproven.isInvalid(), true, 'Memory item with unverified tags should be invalid for planning');
  assert.ok(memoryItemUnproven.forbidden_ops.includes('act'), 'Must forbid acting on unverified memory');

  const memoryItemPlaceholder = validateMemoryPerception({
    content: 'Task: test\nResult: TODO: implement this'
  });
  assert.equal(memoryItemPlaceholder.isInvalid(), true, 'Memory item with placeholder must be invalid');

  // 3. Synthesis Citation Integrity (Point 6)
  console.log('Testing validateDossierInfluence citation integrity (Point 6)...');
  const report = {
    dossierInfluence: [
      {
        workerId: 'worker-1',
        influence: 'Used their code',
        usedClaims: ['Claim A']
      },
      {
        workerId: 'worker-2',
        influence: 'Rejected their approach',
        usedClaims: ['Claim B']
      }
    ]
  };

  const dossiers = [
    {
      workerId: 'worker-1',
      events: [
        { evidenceReport: { claims: [{ statement: 'Claim A' }] } }
      ]
    },
    {
      workerId: 'worker-2',
      events: [
        { evidenceReport: { claims: [{ statement: 'Not Claim B' }] } }
      ]
    }
  ];

  try {
    validateDossierInfluence(report, ['worker-1', 'worker-2'], { dossiers });
    assert.fail('Should have thrown due to invalid citation');
  } catch (err) {
    assert.equal(err.code, 'INVALID_DOSSIER_INFLUENCE');
    assert.ok(err.invalidWorkerIds.includes('worker-2'), 'worker-2 should be flagged invalid for hallucinated claim');
  }

  console.log('All unproven claims integration tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

