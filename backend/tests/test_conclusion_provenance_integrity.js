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
const mcpRegistry = require('../src/services/mcpToolRegistry');

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

function reportsIncompleteEvidence(result, toolName) {
  return result.configured === true && result.output.tool === toolName
    && result.success === false && result.output.provenance.complete === false;
}

async function verifyLineageQueryBound(db) {
  const suffix = Date.now();
  const workspace = `lineage-ws-${suffix}`;
  const caller = `lineage-agent-${suffix}`;
  const first = `lineage-cycle-a-${suffix}`;
  const second = `lineage-cycle-b-${suffix}`;
  await db.run('INSERT INTO workspaces(id,name,path) VALUES(?,?,?)', workspace, workspace, `/${workspace}`);
  await db.run("INSERT INTO agents(id,name,role,status,workspace_id) VALUES(?,?,?,'idle',?)", caller, caller, 'test', workspace);
  await db.run("INSERT INTO lineage_nodes(id,workspace_id,label,node_type) VALUES(?,?,?, 'checkpoint')", first, workspace, first);
  await db.run("INSERT INTO lineage_nodes(id,workspace_id,label,node_type) VALUES(?,?,?, 'checkpoint')", second, workspace, second);
  await db.run("INSERT INTO lineage_edges(id,workspace_id,source_node_id,target_node_id) VALUES(?,?,?,?)", `edge-a-${suffix}`, workspace, first, second);
  await db.run("INSERT INTO lineage_edges(id,workspace_id,source_node_id,target_node_id) VALUES(?,?,?,?)", `edge-b-${suffix}`, workspace, second, first);
  const result = await mcpStrategy.executeStrategyTool('genos_lineage', { target_id: second }, { agentId: caller });
  assert.equal(result.output.truncated, true);
  assert.equal(result.output.evidence.length, 1000);
  assert.equal(result.success, false);
  await db.run('DELETE FROM lineage_edges WHERE id IN (?, ?)', `edge-a-${suffix}`, `edge-b-${suffix}`);
  await db.run('DELETE FROM lineage_nodes WHERE id IN (?, ?)', first, second);
  await db.run('DELETE FROM agents WHERE id = ?', caller);
  await db.run('DELETE FROM workspaces WHERE id = ?', workspace);
}

async function verifyProvenanceScope(db) {
  const suffix = Date.now();
  const workspaceA = `scope-ws-a-${suffix}`;
  const workspaceB = `scope-ws-b-${suffix}`;
  const caller = `scope-agent-a-${suffix}`;
  const targetA = `scope-target-a-${suffix}`;
  const targetB = `scope-target-b-${suffix}`;
  const nodeA = `scope-node-a-${suffix}`;
  const nodeB = `scope-node-b-${suffix}`;
  const edgeB = `scope-edge-b-${suffix}`;
  await db.run('INSERT INTO workspaces(id,name,path) VALUES(?,?,?)', workspaceA, workspaceA, `/${workspaceA}`);
  await db.run('INSERT INTO workspaces(id,name,path) VALUES(?,?,?)', workspaceB, workspaceB, `/${workspaceB}`);
  for (const [id, workspace] of [[caller, workspaceA], [targetA, workspaceA], [targetB, workspaceB]]) {
    await db.run("INSERT INTO agents(id,name,role,status,workspace_id) VALUES(?,?,?,'idle',?)", id, id, 'test', workspace);
  }
  await db.run("INSERT INTO telemetry_events(agent_id,event_type,action) VALUES(?,'test','private-a')", targetA);
  await db.run("INSERT INTO telemetry_events(agent_id,event_type,action) VALUES(?,'test','private-b')", targetB);
  await db.run("INSERT INTO lineage_nodes(id,workspace_id,label,node_type) VALUES(?,?,?, 'checkpoint')", nodeA, workspaceA, nodeA);
  await db.run("INSERT INTO lineage_nodes(id,workspace_id,label,node_type) VALUES(?,?,?, 'checkpoint')", nodeB, workspaceB, nodeB);
  await db.run("INSERT INTO lineage_edges(id,workspace_id,source_node_id,target_node_id) VALUES(?,?,?,?)", edgeB, workspaceB, nodeB, nodeB);

  const allowed = await mcpStrategy.executeStrategyTool('genos_blame', { target_id: targetA }, { agentId: caller });
  assert.equal(allowed.success, true, 'same-workspace blame is available');
  assert.equal(allowed.output.evidence[0].action, 'private-a');
  const registryAllowed = await mcpRegistry.dispatchTool('genos_blame', { target_id: targetA }, { agentId: caller });
  assert.equal(registryAllowed.result.success, true, 'MCP registry forwards caller identity to strategy tools');
  assert.equal(registryAllowed.result.output.evidence[0].action, 'private-a');
  const foreignBlame = await mcpStrategy.executeStrategyTool('genos_blame', { target_id: targetB }, { agentId: caller });
  const noCaller = await mcpStrategy.executeStrategyTool('genos_blame', { target_id: targetA });
  assert.equal(foreignBlame.success, false, 'foreign-workspace blame is denied');
  assert.deepEqual(foreignBlame.output.evidence, []);
  assert.deepEqual(
    { success: foreignBlame.success, error: foreignBlame.output.error, evidence: foreignBlame.output.evidence, provenance: foreignBlame.output.provenance },
    { success: noCaller.success, error: noCaller.output.error, evidence: noCaller.output.evidence, provenance: noCaller.output.provenance },
    'scope denial does not reveal whether target exists'
  );
  const foreignLineage = await mcpStrategy.executeStrategyTool('genos_lineage', { target_id: nodeB }, { agentId: caller });
  assert.equal(foreignLineage.success, false, 'foreign-workspace lineage is denied');
  assert.deepEqual(foreignLineage.output.evidence, []);

  await db.run('DELETE FROM telemetry_events WHERE agent_id IN (?, ?)', targetA, targetB);
  await db.run('DELETE FROM lineage_edges WHERE id = ?', edgeB);
  await db.run('DELETE FROM lineage_nodes WHERE id IN (?, ?)', nodeA, nodeB);
  await db.run('DELETE FROM agents WHERE id IN (?, ?, ?)', caller, targetA, targetB);
  await db.run('DELETE FROM workspaces WHERE id IN (?, ?)', workspaceA, workspaceB);
}

async function runSuite() {
  console.log('===============================================================');
  console.log('       CONCLUSION PROVENANCE & EPISTEMIC INTEGRITY SUITE       ');
  console.log('===============================================================');

  const db = await getDatabase();
  await verifyLineageQueryBound(db);
  await verifyProvenanceScope(db);

  // Test 1: Merkle Provenance Chain Traversal & Truncation
  console.log('\n--- 1. Cryptographic Merkle DAG Provenance Traversal ---');
  const rootProv = await recordProvenance('test_root', 'spec-01', { premise: 'Base requirement specification' });
  const alternateRoot = await recordProvenance('test_root', 'spec-02', { premise: 'Alternate specification' });
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

  await db.run('UPDATE provenance_records SET payload_json = ? WHERE id = ?', JSON.stringify({ premise: 'tampered' }), rootProv.id);
  const tamperedTrace = await resolveProvenance({ targetId: synthProv.payloadHash, maxDepth: 10 });
  check(tamperedTrace.success === false, 'Tampered provenance payload is rejected');
  await db.run('UPDATE provenance_records SET payload_json = ? WHERE id = ?', JSON.stringify({ premise: 'Base requirement specification' }), rootProv.id);

  await db.run('UPDATE provenance_records SET parent_hash = ? WHERE id = ?', 'missing-parent-hash', workerProv.id);
  const missingParentTrace = await resolveProvenance({ targetId: synthProv.payloadHash, maxDepth: 10 });
  check(missingParentTrace.success === false, 'Missing provenance parent is rejected');
  await db.run('UPDATE provenance_records SET parent_hash = ? WHERE id = ?', rootProv.payloadHash, workerProv.id);

  await db.run('UPDATE provenance_records SET parent_hash = ? WHERE id = ?', alternateRoot.payloadHash, workerProv.id);
  const reboundParentTrace = await resolveProvenance({ targetId: synthProv.payloadHash, maxDepth: 10 });
  check(reboundParentTrace.success === false, 'Rebinding a valid parent without changing the child hash is rejected');
  await db.run('UPDATE provenance_records SET parent_hash = ? WHERE id = ?', rootProv.payloadHash, workerProv.id);

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
  check(storedDecision?.evidence_status === 'linked' && JSON.parse(storedDecision.evidence_refs_json).includes(synthProv.payloadHash), 'Memory decision stores its evidence binding and linked status');

  const decisionProv = await db.get('SELECT * FROM provenance_records WHERE subject_id = ?', memId);
  check(decisionProv && decisionProv.parent_hash === synthProv.payloadHash, 'Decision is cryptographically linked to conclusion parent hash');
  check(storedDecision?.provenance_record_id === decisionProv?.id && storedDecision?.provenance_hash === decisionProv?.payload_hash, 'Decision row points to its immutable provenance receipt');

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
  check(reportsIncompleteEvidence(mcpBlame, 'genos_blame'), 'MCP genos_blame preserves incomplete evidence as failure');

  const mcpLineage = await mcpStrategy.executeStrategyTool('genos_lineage', { target_id: 'unknown-target' });
  check(reportsIncompleteEvidence(mcpLineage, 'genos_lineage'), 'MCP genos_lineage preserves incomplete evidence as failure');

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
