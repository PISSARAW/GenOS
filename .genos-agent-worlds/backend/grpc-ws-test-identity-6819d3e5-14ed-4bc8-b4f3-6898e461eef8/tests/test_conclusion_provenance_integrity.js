/**
 * Test Suite: Conclusion Provenance, Merkle DAG & Epistemic Tracking Integrity
 * Validates:
 * 1. Cryptographic Merkle provenance chain traversal and cycle detection
 * 2. Decision and memory provenance linking from conclusion to genome_decisions
 * 3. Strict rejection of unevidenced success conclusions in classifyFinalReport
 * 4. Nested evidence report inspection in hallucinationMonitoringService
 * 5. Hypothesis verification without false-positive falsification
 * 6. Strategy primitives and MCP tools (preserve_provenance, belief_provenance, contradiction_check, belief_gate, genos_blame, genos_lineage)
 */

const assert = require('assert');
const { getDatabase } = require('../src/db');
const { recordProvenance } = require('../src/services/evaluationObservabilityService');
const { resolveProvenance } = require('../src/services/provenanceResolver');
const temporal = require('../src/services/primitiveHandlers/temporal');
const agentMemory = require('../src/services/agentMemoryContext');
const workerRecovery = require('../src/services/workerFailureRecoveryService');
const hallucination = require('../src/services/hallucinationMonitoringService');
const safetyHypothesis = require('../src/services/primitiveHandlers/safetyHypothesis');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');
const mcpStrategy = require('../src/services/mcpStrategyTools');

let passedTests = 0;
let failedTests = 0;

function check(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runSuite() {
  console.log('===============================================================');
  console.log('       CONCLUSION PROVENANCE & EPISTEMIC INTEGRITY SUITE       ');
  console.log('===============================================================');

  const db = await getDatabase();

  // Test 1: Merkle Provenance Chain Traversal & Truncation
  console.log('\n--- 1. Cryptographic Merkle DAG Provenance Traversal ---');
  const rootProv = await recordProvenance('test_root', 'spec-01', { premise: 'Base requirement specification' });
  const workerProv = await recordProvenance('worker_evidence', 'worker-01', {
    findings: 'Code inspected and unit tests generated'
  }, rootProv.payloadHash);
  const synthProv = await recordProvenance('conclusion', 'orch-01', {
    statement: 'Feature completely verified with tests',
    claims: [{ statement: 'Passes all specs', evidence: ['cargo test passed'] }]
  }, workerProv.payloadHash);

  const fullTrace = await resolveProvenance({ targetId: synthProv.payloadHash, maxDepth: 10 });
  check(fullTrace.success === true, 'Merkle trace resolves successfully');
  check(fullTrace.provenanceType === 'merkle_chain', 'Provenance type identified as merkle_chain');
  check(fullTrace.lineage.length === 3, `Lineage depth is 3 (got ${fullTrace.lineage.length})`);
  check(fullTrace.rootHash === rootProv.payloadHash, 'Root hash matches base specification hash');
  check(fullTrace.truncated === false, 'Full trace is not truncated');

  const truncatedTrace = await resolveProvenance({ targetId: synthProv.payloadHash, maxDepth: 2 });
  check(truncatedTrace.lineage.length === 2, 'Truncated trace respects maxDepth 2');
  check(truncatedTrace.truncated === true, 'Truncated flag is true when more ancestors exist');

  // Test 2: Decision and Memory Provenance Linking
  console.log('\n--- 2. Decision & Memory Provenance Linking ---');
  const testAgentId = 'agent_prov_verify_' + Date.now();
  const testTask = 'Integrate authentication tokens';
  const testSummary = 'Implemented JWT verification middleware';
  const memId = await agentMemory.compileExecutionMemory(testAgentId, testTask, testSummary, {
    outcome: 'success',
    claims: [{ statement: 'JWT signature verified', evidence: ['jwt.verify test passed'] }],
    provenanceHash: synthProv.payloadHash
  });

  check(memId !== null, 'compileExecutionMemory succeeded and created memory ID');
  const storedDecision = await db.get('SELECT * FROM genome_decisions WHERE id = ?', memId);
  check(storedDecision && storedDecision.content.includes('Claims: [JWT signature verified'), 'Decision content preserves structured claims and evidence');

  const decisionProv = await db.get('SELECT * FROM provenance_records WHERE subject_id = ?', memId);
  check(decisionProv && decisionProv.parent_hash === synthProv.payloadHash, 'Decision is cryptographically linked to conclusion parent hash');

  // Clean up test decisions and provs
  await db.run('DELETE FROM genome_decisions WHERE id = ?', memId);
  if (decisionProv) await db.run('DELETE FROM provenance_records WHERE id = ?', decisionProv.id);
  await db.run('DELETE FROM provenance_records WHERE id IN (?, ?, ?)', rootProv.id, workerProv.id, synthProv.id);

  // Test 3: Rejection of Unevidenced Success in classifyFinalReport
  console.log('\n--- 3. Rejection of Unevidenced Success Conclusions ---');
  const emptyClaimsReport = { outcome: 'success', claims: [] };
  const classifiedEmpty = workerRecovery.classifyFinalReport(emptyClaimsReport, true);
  check(classifiedEmpty.outcome === 'failed', 'Worker reporting success with empty claims is rejected as failed');
  check(classifiedEmpty.failure?.category === 'unresolved_task', 'Empty claims classified under unresolved_task');

  const unevidencedReport = {
    outcome: 'success',
    claims: [{ statement: 'Everything is fine', evidence: [] }]
  };
  const classifiedUnevidenced = workerRecovery.classifyFinalReport(unevidencedReport, true);
  check(classifiedUnevidenced.outcome === 'failed', 'Worker reporting success with claim lacking evidence is rejected as failed');

  const validReport = {
    outcome: 'success',
    claims: [{ statement: 'Everything is fine', evidence: ['receipt-001'] }]
  };
  const classifiedValid = workerRecovery.classifyFinalReport(validReport, true);
  check(classifiedValid.outcome === 'success', 'Worker reporting success with evidenced claim is accepted as success');

  // Test 4: Nested Evidence Reports in hallucinationMonitoringService
  console.log('\n--- 4. Nested Evidence Reports in Hallucination Monitoring ---');
  const hallucinatingCompletedEvent = {
    eventType: 'AGENT_COMPLETED',
    agentId: 'agent-hallu-test',
    payload: {
      evidenceReport: {
        claims: [
          { statement: 'Hallucinated theorem', evidence: [] }
        ]
      }
    }
  };
  const halluInspection = hallucination.inspectEvent(hallucinatingCompletedEvent);
  check(halluInspection.detected === true, 'Hallucination monitor detects unevidenced claim in evidenceReport');
  check(halluInspection.reasons.some(r => r.includes('lack evidence')), 'Reason mentions claim lacking evidence');

  const healthyCompletedEvent = {
    eventType: 'AGENT_COMPLETED',
    agentId: 'agent-healthy-test',
    payload: {
      evidenceReport: {
        claims: [
          { statement: 'Proven fact', evidence: ['receipt-ok'] }
        ]
      }
    }
  };
  const healthyInspection = hallucination.inspectEvent(healthyCompletedEvent);
  check(healthyInspection.detected === false, 'Healthy evidence report with valid evidence passes without hallucination flags');

  // Test 5: Hypothesis Evidence Affirmation Logic
  console.log('\n--- 5. Hypothesis Evidence Affirmation & Falsification ---');
  const affirmativeHyp = { id: 'hyp-affirm', statement: 'Storage subsystem is clean, healthy and passed tests' };
  const defectHyp = { id: 'hyp-defect', statement: 'Storage subsystem has a deadlock defect or bug' };
  const passingEvidence = [{ statement: 'Storage unit tests clean and passed with 0 errors' }];

  const evalResult = await safetyHypothesis.hypothesisEvidence({
    hypotheses: [affirmativeHyp, defectHyp],
    evidence: passingEvidence
  });

  const retainedAffirm = evalResult.retainedHypotheses.find(h => h.id === 'hyp-affirm');
  const falsifiedDefect = evalResult.falsifiedHypotheses.find(h => h.id === 'hyp-defect');
  check(!!retainedAffirm, 'Affirmative hypothesis is retained when tests pass clean');
  check(!!falsifiedDefect, 'Defect hypothesis is correctly falsified when component is clean');

  // Test 6: Strategy Primitives and MCP Tools Routing
  console.log('\n--- 6. Strategy Primitives & MCP Tools Execution ---');
  const contraCheck = await strategyAdapter.executePrimitive('contradiction_check', {
    beliefs: [{ id: 'b1', statement: 'Network socket clean and passed' }],
    evidence: [{ statement: 'Network socket failed with timeout error' }]
  });
  check(contraCheck.success === true, 'contradiction_check primitive executes successfully');
  check(contraCheck.hasContradictions === true, 'Contradiction between clean statement and failed error detected');

  const gatePass = await strategyAdapter.executePrimitive('belief_gate', {
    belief: { statement: 'Verified config', confidence: 0.85 },
    evidence: []
  });
  check(gatePass.success === true && gatePass.allowed === true, 'belief_gate allows valid uncontroverted belief');

  const gateReject = await strategyAdapter.executePrimitive('belief_gate', {
    belief: { statement: 'Broken state clean and passed', confidence: 0.9 },
    evidence: [{ statement: 'Broken state failed with panic error' }]
  });
  check(gateReject.success === true && gateReject.allowed === false, 'belief_gate rejects belief contradicted by evidence');

  const mcpBlame = await mcpStrategy.executeStrategyTool('genos_blame', { target_id: 'unknown-target' });
  check(mcpBlame.success === true, 'MCP genos_blame tool executes via strategy primitive');

  const mcpLineage = await mcpStrategy.executeStrategyTool('genos_lineage', { target_id: 'unknown-target' });
  check(mcpLineage.success === true, 'MCP genos_lineage tool executes via strategy primitive');

  console.log('\n===============================================================');
  console.log(`RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
