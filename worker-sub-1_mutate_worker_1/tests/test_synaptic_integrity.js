/**
 * Test Suite: Synaptic Subsystem Comprehensive Integrity
 * Validates all 6 corrective areas:
 * 1. Biophysical Conductance & Directional GraphRAG Propagation
 * 2. SQLite B-Tree Indexes on memory_synapses
 * 3. MCP Synaptic Tools Scoping & Circular Loop Elimination
 * 4. Differential Sleep Cycle (LTP for active vs LTD for inactive)
 * 5. Non-destructive Synaptic Vesicles & Prompt Force Injection
 * 6. Multi-tenant Scoping in STDP & Temporal Causality + Agent Ping
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../src/db');
const vectorMemory = require('../src/services/vectorMemoryService');
const graphRag = require('../src/services/graphRagService');
const agentMemory = require('../src/services/agentMemoryContext');
const synapticTransmission = require('../src/services/synapticTransmissionService');
const mcpBioTools = require('../src/services/mcpBioTools');
const mcpStrategyTools = require('../src/services/mcpStrategyTools');
const memoryPrimitives = require('../src/services/primitiveHandlers/memory');
const temporalPrimitives = require('../src/services/primitiveHandlers/temporal');
const { testSynapticPing } = require('./test_synaptic_ping');

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

async function runSynapticIntegritySuite() {
  console.log('===============================================================');
  console.log('       SYNAPTIC INTEGRITY & BIOPHYSICAL VALIDATION SUITE       ');
  console.log('===============================================================');

  const db = await getDatabase();
  const testOrg = 'org-synapse-test';
  const testProj = 'proj-synapse-test';
  const testAgent = 'agent-synapse-tester';

  // Seed tenant if needed
  await db.run('INSERT OR IGNORE INTO organizations (id, name) VALUES (?, ?)', testOrg, 'Synapse Org');
  await db.run('INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES (?, ?, ?)', testProj, testOrg, 'Synapse Proj');

  const idSource = `dec-syn-src-${Date.now()}`;
  const idTargetA = `dec-syn-tgta-${Date.now()}`;
  const idTargetGaba = `dec-syn-tgtgaba-${Date.now()}`;

  const dummyVec = Buffer.from(new Float32Array(new Array(768).fill(0.04)).buffer);

  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    idSource, 'Source Strategy', 'Foundational algorithm for vector search', dummyVec, testAgent, 'Architecture', 1.0, testOrg, testProj
  );
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    idTargetA, 'Excitatory Target', 'Downstream optimization for vector search', dummyVec, testAgent, 'Architecture', 1.0, testOrg, testProj
  );
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    idTargetGaba, 'Inhibited Pitfall', 'Deprecate old vector algorithm completely', dummyVec, testAgent, 'Correction', 1.0, testOrg, testProj
  );

  // -------------------------------------------------------------
  // Point 1: Biophysical Conductance & Directional GraphRAG
  // -------------------------------------------------------------
  console.log('\n--- 1. Biophysical Conductance & GraphRAG Traversal ---');
  await db.run(
    'INSERT OR REPLACE INTO memory_synapses (source_id, target_id, weight, transmitter_type, activity_history, organization_id, project_id) VALUES (?, ?, 1.5, ?, 0, ?, ?)',
    idSource, idTargetA, 'glutamate', testOrg, testProj
  );
  await db.run(
    'INSERT OR REPLACE INTO memory_synapses (source_id, target_id, weight, transmitter_type, activity_history, organization_id, project_id) VALUES (?, ?, 5.0, ?, 0, ?, ?)',
    idSource, idTargetGaba, 'gaba', testOrg, testProj
  );

  const traversed = await graphRag.traverseSynapses([idSource], db, testAgent, { organizationId: testOrg });
  const hasExcitatory = traversed.some(n => n.id === idTargetA);
  const hasGaba = traversed.some(n => n.id === idTargetGaba);
  check(hasExcitatory, 'GraphRAG successfully propagated across excitatory glutamate synapse');
  check(!hasGaba, 'GraphRAG strictly excluded GABAergic inhibitory synapse from spreading activation');

  const searchInhib = await vectorMemory.searchMemory('Deprecate old vector algorithm', { limit: 5, ownerId: testAgent }, db);
  const isTargetInhibited = searchInhib.allScoredExperiences.some(e => e.id === idTargetGaba && e.inhibitorySignal === 'active');
  check(isTargetInhibited, 'GABA synapse with positive conductance triggers active inhibitorySignal');

  // -------------------------------------------------------------
  // Point 2: B-Tree Indexes on memory_synapses
  // -------------------------------------------------------------
  console.log('\n--- 2. SQLite B-Tree Indexes Verification ---');
  const indexes = await db.all('SELECT name FROM sqlite_master WHERE type = ? AND tbl_name = ?', 'index', 'memory_synapses');
  const indexNames = new Set(indexes.map(i => i.name));
  check(indexNames.has('idx_synapses_target'), 'B-Tree index idx_synapses_target exists');
  check(indexNames.has('idx_synapses_weight'), 'B-Tree index idx_synapses_weight exists');
  check(indexNames.has('idx_synapses_pruning'), 'B-Tree index idx_synapses_pruning exists');
  check(indexNames.has('idx_synapses_tenant'), 'B-Tree index idx_synapses_tenant exists');

  // -------------------------------------------------------------
  // Point 3: MCP Synaptic Tools Scoping & Loop Elimination
  // -------------------------------------------------------------
  console.log('\n--- 3. MCP Synaptic Pruning Scoping & Transport ---');
  const foreignSource = `dec-for-src-${Date.now()}`;
  const foreignTarget = `dec-for-tgt-${Date.now()}`;
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by) VALUES (?, ?, ?, ?)', foreignSource, 'Foreign', 'Foreign node', 'other-agent');
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by) VALUES (?, ?, ?, ?)', foreignTarget, 'Foreign 2', 'Foreign target', 'other-agent');
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight, c3_opsonization, cd47_expression) VALUES (?, ?, 0.02, 0.9, 0.1)', foreignSource, foreignTarget);

  const pruneResult = await mcpStrategyTools.executeStrategyTool('genos_synaptic_prune_scale', {
    agent_id: testAgent,
    threshold: 2.0,
    organization_id: testOrg,
    project_id: testProj
  });
  check(pruneResult.success && pruneResult.configured, 'MCP genos_synaptic_prune_scale executed successfully via strategy primitive');
  const foreignStillExists = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', foreignSource, foreignTarget);
  check(Boolean(foreignStillExists), 'Scoped prune_scale preserved synapses belonging to other agents/tenants');

  const bioPruneRes = await mcpBioTools.executeBioTool('genos_synaptic_prune_scale', {
    agent_id: 'other-agent',
    threshold: 0.1,
    scale: 1.0
  });
  check(bioPruneRes.success && bioPruneRes.transport === 'local_db', 'mcpBioTools executes prune_scale directly in-process via local_db without circular HTTP loop');

  // -------------------------------------------------------------
  // Point 4: Differential Sleep Cycle (LTP vs LTD)
  // -------------------------------------------------------------
  console.log('\n--- 4. Differential Sleep Cycle (LTP vs LTD) ---');
  const ltpSrc = `dec-ltp-s-${Date.now()}`;
  const ltpTgt = `dec-ltp-t-${Date.now()}`;
  const ltdSrc = `dec-ltd-s-${Date.now()}`;
  const ltdTgt = `dec-ltd-t-${Date.now()}`;
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, synaptic_weight) VALUES (?, ?, ?, ?, ?)', ltpSrc, 'LTP S', 'LTP test', testAgent, 1.0);
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, synaptic_weight) VALUES (?, ?, ?, ?, ?)', ltpTgt, 'LTP T', 'LTP test', testAgent, 1.0);
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, synaptic_weight) VALUES (?, ?, ?, ?, ?)', ltdSrc, 'LTD S', 'LTD test', testAgent, 1.0);
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, synaptic_weight) VALUES (?, ?, ?, ?, ?)', ltdTgt, 'LTD T', 'LTD test', testAgent, 1.0);

  await db.run(
    'INSERT INTO memory_synapses (source_id, target_id, weight, activity_history, c3_opsonization, cd47_expression, receptor_density) VALUES (?, ?, 1.0, 4, 0.8, 0.2, 1.0)',
    ltpSrc, ltpTgt
  );
  await db.run(
    'INSERT INTO memory_synapses (source_id, target_id, weight, activity_history, c3_opsonization, cd47_expression, receptor_density) VALUES (?, ?, 1.0, 0, 0.1, 1.0, 1.0)',
    ltdSrc, ltdTgt
  );

  await vectorMemory.sleepCycle(db);

  const ltpAfter = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', ltpSrc, ltpTgt);
  const ltdAfter = await db.get('SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?', ltdSrc, ltdTgt);

  check(ltpAfter && ltpAfter.weight > 1.0, 'Active synapse underwent LTP weight potentiation during sleep');
  check(ltpAfter && ltpAfter.c3_opsonization === 0.0 && ltpAfter.cd47_expression > 0.2, 'Active synapse cleared C3 opsonization and upregulated CD47 protection');
  check(ltdAfter && ltdAfter.weight < 1.0, 'Inactive synapse underwent LTD synaptic depression');
  check(ltpAfter && ltpAfter.activity_history === 0 && ltdAfter && ltdAfter.activity_history === 0, 'Activity history was reset to 0 across all synapses after consolidation');

  // -------------------------------------------------------------
  // Point 5: Synaptic Vesicles & Prompt Force Injection
  // -------------------------------------------------------------
  console.log('\n--- 5. Non-destructive Vesicles & Synaptic Force in Prompt ---');
  const cleftFile = await synapticTransmission.releaseVesicles([
    { content: 'Broadcast wisdom engram', vector: new Array(768).fill(0.1) }
  ]);
  check(fs.existsSync(cleftFile), 'Vesicle released into synaptic cleft');

  const peeked = await synapticTransmission.uptakeVesicles(testAgent, { peek: true });
  check(peeked.length > 0 && fs.existsSync(cleftFile), 'uptakeVesicles with peek: true read engrams without unlinking file');

  const prompt = await agentMemory.formatCognitiveMemoryPrompt(testAgent, 'Source Strategy');
  check(prompt.includes('(force:'), 'formatCognitiveMemoryPrompt correctly displays synaptic force (force: X.X)');
  try { fs.unlinkSync(cleftFile); } catch {}

  // -------------------------------------------------------------
  // Point 6: Multi-tenant STDP & Temporal Causality + Agent Ping
  // -------------------------------------------------------------
  console.log('\n--- 6. Multi-tenant STDP, Temporal Scoping & Agent Ping ---');
  const stdpRes = await memoryPrimitives.stdpUpdate({
    sourceId: ltpSrc,
    targetId: ltpTgt,
    preSpikeAt: 1000,
    postSpikeAt: 1015,
    organizationId: testOrg,
    projectId: testProj
  });
  check(stdpRes.success, 'STDP update executed successfully');
  const stdpRow = await db.get('SELECT organization_id, project_id FROM memory_synapses WHERE source_id = ? AND target_id = ?', ltpSrc, ltpTgt);
  check(stdpRow && stdpRow.organization_id === testOrg && stdpRow.project_id === testProj, 'STDP synapse correctly persisted organization_id and project_id');

  const depRes = await temporalPrimitives.dependencyMatrix({
    workspaceId: 'ws-local',
    orchestratorId: testAgent
  });
  check(depRes && typeof depRes === 'object', 'dependencyMatrix resolved workspace tenant cleanly without column mismatch');

  const pingOk = testSynapticPing(testAgent);
  check(pingOk, 'genos agent ping command executed cleanly and returned valid response');

  // Cleanup test nodes
  await db.run('DELETE FROM genome_decisions WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)', idSource, idTargetA, idTargetGaba, foreignSource, foreignTarget, ltpSrc, ltpTgt, ltdSrc, ltdTgt);
  await db.run('DELETE FROM memory_synapses WHERE source_id IN (?, ?, ?, ?, ?, ?) OR target_id IN (?, ?, ?, ?, ?, ?)', idSource, idSource, foreignSource, ltpSrc, ltdSrc, idTargetA, idTargetGaba, foreignTarget, ltpTgt, ltdTgt, ltpSrc, ltdSrc);

  console.log(`\nSynaptic Integrity Suite Completed: ${passedTests} PASSED, ${failedTests} FAILED\n`);
  return { passed: passedTests, failed: failedTests };
}

if (require.main === module) {
  runSynapticIntegritySuite().then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  }).catch(err => {
    console.error('Test suite uncaught error:', err);
    process.exitCode = 1;
  });
}

module.exports = { runSynapticIntegritySuite };

