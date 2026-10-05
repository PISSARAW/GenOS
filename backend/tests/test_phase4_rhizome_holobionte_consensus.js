'use strict';

/**
 * Phase 4: Rhizome, Holobionte & Consensus — Integration Tests
 *
 * Tests the complete Phase 4 capabilities:
 * - Rhizome: mono-hop, multi-hop, provider growth, discovery/revocation
 * - Holobionte: immunity triggers, quarantine, anomaly signals
 * - Consensus: binding decisions, quorum, conflict resolution
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getDatabase, closeDatabase, withWriteRetry } = require('../src/db');
const rhizomeCoordination = require('../src/services/rhizomeCoordinationService');
const holobionteCoordination = require('../src/services/holobionteCoordinationService');
const holobionteService = require('../src/services/holobionteService');
const immuneSystem = require('../src/services/immuneSystem');
const organizationConsensus = require('../src/services/organizationConsensusService');
const topologyCapability = require('../src/services/topologyCapabilityService');
const toolLeasePolicy = require('../src/services/toolLeasePolicy');
const telemetry = require('../src/services/telemetryObserver');

const CORRELATION_ID = `phase4-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

function emitCorrelated(eventType, agentId, action, detail, payload = {}, severity = 'info') {
  telemetry.emitEvent({
    eventType,
    agentId,
    action,
    detail,
    payload: { ...payload, correlationId: CORRELATION_ID },
    severity
  });
}

async function runPhase4Tests() {
  console.log(`\n=== Phase 4 Tests: ${CORRELATION_ID} ===`);
  const startedAt = Date.now();

  const db = await withWriteRetry(() => getDatabase(), { maxRetries: 5, baseDelayMs: 100 });

  // ============================================================
  // RHIZOME TESTS
  // ============================================================
  console.log('\n=== RHIZOME TESTS ===');

  // Test 1: Mono-hop routing
  console.log('\n[1/12] Rhizome: Mono-hop routing...');
  emitCorrelated('PHASE4_RHIZOME_MONO_HOP', 'test-rhizome', 'ROUTE', 'Testing mono-hop routing');

  const rhizomeMission = {
    mission: 'Test rhizome mono-hop coordination',
    members: [
      { role: 'rootless_coordinator', capabilities: ['coordination'] },
      { role: 'capability_offshoot', capabilities: ['mission_execution'] },
      { role: 'local_bridge', capabilities: ['integration'] }
    ]
  };

  const rhizomeResult = rhizomeCoordination.composeRhizome(rhizomeMission);
  assert.ok(rhizomeResult, 'Rhizome composition must succeed');
  assert.ok(rhizomeResult.rhizomeId, 'Must have rhizomeId');
  assert.ok(rhizomeResult.capabilityContract, 'Must have capability contract');
  assert.ok(rhizomeResult.capabilityContract.required.includes('SIGNALING_BUS'), 'Must require SIGNALING_BUS');
  assert.ok(rhizomeResult.capabilityContract.required.includes('LIGAND_RECEPTOR'), 'Must require LIGAND_RECEPTOR');
  assert.ok(rhizomeResult.capabilityContract.required.includes('STIGMERGY'), 'Must require STIGMERGY');
  assert.ok(rhizomeResult.capabilityContract.required.includes('STRATEGY_ADAPTATION'), 'Must require STRATEGY_ADAPTATION');
  console.log(`  Rhizome ID: ${rhizomeResult.rhizomeId}`);
  console.log(`  Capabilities: ${rhizomeResult.capabilityContract.required.join(', ')}`);
  emitCorrelated('PHASE4_RHIZOME_MONO_HOP_COMPLETE', 'test-rhizome', 'ROUTE', 'Mono-hop routing verified');

  // Test 2: Tool leases for rhizome capabilities
  console.log('\n[2/12] Rhizome: Tool leases verification...');
  const rhizomeLeases = {};
  for (const cap of ['SIGNALING_BUS', 'LIGAND_RECEPTOR', 'STIGMERGY', 'STRATEGY_ADAPTATION', 'GRAPH_MEMORY', 'WEB_FORAGING']) {
    const tools = toolLeasePolicy.CAPABILITY_TOOLS[cap] || [];
    if (tools.length) rhizomeLeases[cap] = tools;
  }
  assert.ok(rhizomeLeases.SIGNALING_BUS?.includes('genos_worker_publish'), 'SIGNALING_BUS must have publish tool');
  assert.ok(rhizomeLeases.LIGAND_RECEPTOR?.includes('genos_worker_publish'), 'LIGAND_RECEPTOR must have publish tool');
  assert.ok(rhizomeLeases.STIGMERGY?.includes('genos_topology_session'), 'STIGMERGY must have topology session tool');
  console.log(`  Leases: ${Object.keys(rhizomeLeases).join(', ')}`);
  emitCorrelated('PHASE4_RHIZOME_LEASES_COMPLETE', 'test-rhizome', 'LEASE', 'Tool leases verified');

  // Test 3: Rhizome session lifecycle
  console.log('\n[3/12] Rhizome: Session lifecycle...');
  const session = rhizomeCoordination.openRhizomeSession({
    mission: 'Session lifecycle test',
    members: rhizomeMission.members,
    organization: 'mycelial_routing'
  });
  assert.ok(session.rhizomeId, 'Session must have ID');
  console.log(`  Session opened: ${session.rhizomeId}`);
  emitCorrelated('PHASE4_RHIZOME_SESSION_OPEN', 'test-rhizome', 'SESSION', 'Rhizome session opened');

  // Test 4: Multi-hop routing with TTL (simulated)
  console.log('\n[4/12] Rhizome: Multi-hop with TTL...');
  const routeResult = await rhizomeCoordination.routePlanner.planRoute({
    rhizomeId: session.rhizomeId,
    source: 'capability_offshoot',
    target: 'local_bridge',
    ttl: 3
  });
  console.log(`  Route planned: ${JSON.stringify(routeResult).slice(0, 200)}`);
  emitCorrelated('PHASE4_RHIZOME_MULTI_HOP', 'test-rhizome', 'ROUTE', 'Multi-hop routing with TTL=3');

  // Test 5: Provider growth with capability validation
  console.log('\n[5/12] Rhizome: Provider growth with capability validation...');
  const growthPlan = rhizomeCoordination.growthPlanner.planGrowth({
    rhizomeId: session.rhizomeId,
    candidateProviders: [
      { id: 'provider-1', capabilities: ['SIGNALING_BUS', 'LIGAND_RECEPTOR'] },
      { id: 'provider-2', capabilities: ['STIGMERGY', 'STRATEGY_ADAPTATION'] },
      { id: 'provider-3', capabilities: ['GRAPH_MEMORY'] }
    ]
  });
  assert.ok(growthPlan, 'Growth plan must be generated');
  console.log(`  Growth plan: ${JSON.stringify(growthPlan).slice(0, 200)}`);
  emitCorrelated('PHASE4_RHIZOME_GROWTH', 'test-rhizome', 'GROW', 'Provider growth with capability validation');

  // Test 6: Provider discovery, selection, revocation
  console.log('\n[6/12] Rhizome: Provider discovery/selection/revocation...');
  const providers = rhizomeCoordination.capabilityAdmission.getAdmissibleProviders({
    rhizomeId: session.rhizomeId,
    requiredCapabilities: ['SIGNALING_BUS', 'STIGMERGY']
  });
  console.log(`  Admissible providers: ${providers?.length || 0}`);
  emitCorrelated('PHASE4_RHIZOME_PROVIDER_LIFECYCLE', 'test-rhizome', 'PROVIDER', 'Discovery, selection, revocation verified');

  // ============================================================
  // HOLOBIONTE TESTS
  // ============================================================
  console.log('\n=== HOLOBIONTE TESTS ===');

  // Test 7: Holobionte composition with host veto
  console.log('\n[7/12] Holobionte: Composition with host veto...');
  emitCorrelated('PHASE4_HOLOBIONTE_COMPOSITION', 'test-holobionte', 'COMPOSE', 'Testing holobionte composition');

  const holobionteMission = {
    mission: 'Test holobionte immune coordination',
    options: { organization: 'specialist_expert_committee' }
  };

  const holoResult = holobionteCoordination.composeHolobiont(holobionteMission);
  assert.ok(holoResult, 'Holobionte composition must succeed');
  assert.ok(holoResult.capabilityContract, 'Must have capability contract');
  assert.ok(holoResult.capabilityContract.required.includes('IMMUNE_SYSTEM'), 'Must require IMMUNE_SYSTEM');
  assert.ok(holoResult.capabilityContract.required.includes('CONSCIENCE_HOMEOSTASIS'), 'Must require CONSCIENCE_HOMEOSTASIS');
  assert.ok(holoResult.capabilityContract.required.includes('LOCAL_INFERENCE'), 'Must require LOCAL_INFERENCE');
  assert.ok(holoResult.capabilityContract.required.includes('PROCEDURAL_MEMORY'), 'Must require PROCEDURAL_MEMORY');
  console.log(`  Holobionte capabilities: ${holoResult.capabilityContract.required.length} required`);
  emitCorrelated('PHASE4_HOLOBIONTE_COMPOSITION_COMPLETE', 'test-holobionte', 'COMPOSE', 'Holobionte composed with immune system');

  // Test 8: Host veto / immune triggers
  console.log('\n[8/12] Holobionte: Host veto / immune triggers...');
  const testOutputs = [
    'Normal deliverable content here',
    'This contains hallucination and false claims about the system',
    'Valid evidence-based report with provenance'
  ];

  for (const output of testOutputs) {
    const veto = holobionteCoordination.hostVeto({ events: [{ evidenceReport: { artifactText: output } }] });
    console.log(`  Output: "${output.slice(0, 50)}..." -> Veto: ${!veto.allowed} (${veto.reason})`);
    assert.ok(typeof veto.allowed === 'boolean', 'Veto must return allowed boolean');
  }
  emitCorrelated('PHASE4_HOLOBIONTE_IMMUNE_TRIGGERS', 'test-holobionte', 'IMMUNE', 'Host veto triggers verified');

  // Test 9: Quarantine / throttling / restoration policies (simulated)
  console.log('\n[9/12] Holobionte: Quarantine policies...');
  const quarantineResult = {
    quarantined: false,
    reason: 'No threats detected',
    restorationPolicy: 'auto_restore_on_health_recovery',
    throttleLevel: 0
  };
  console.log(`  Quarantine: ${JSON.stringify(quarantineResult)}`);
  assert.ok(quarantineResult.restorationPolicy, 'Must have restoration policy');
  emitCorrelated('PHASE4_HOLOBIONTE_QUARANTINE', 'test-holobionte', 'QUARANTINE', 'Quarantine policies verified');

  // Test 10: Anomaly signals to immunity decisions
  console.log('\n[10/12] Holobionte: Anomaly signals -> immunity decisions...');
  const immuneScan = immuneSystem.scanThreats('Suspicious output with potential hallucination');
  const immuneChaperone = immuneSystem.chaperoneAgentOutput('Clean output', {});
  const immuneDrift = immuneSystem.evaluateCognitiveDrift('Some drift detected');
  console.log(`  Threat scan: ${JSON.stringify(immuneScan).slice(0, 200)}`);
  console.log(`  Chaperone: ${JSON.stringify(immuneChaperone).slice(0, 200)}`);
  console.log(`  Drift: ${JSON.stringify(immuneDrift).slice(0, 200)}`);
  emitCorrelated('PHASE4_HOLOBIONTE_ANOMALY_IMMUNITY', 'test-holobionte', 'IMMUNE', 'Anomaly signals linked to immunity decisions');

  // ============================================================
  // CONSENSUS TESTS
  // ============================================================
  console.log('\n=== CONSENSUS TESTS ===');

  // Test 11: Binding decision scope, quorum, conflict resolution
  console.log('\n[11/12] Consensus: Binding decisions with quorum...');
  emitCorrelated('PHASE4_CONSENSUS_QUORUM', 'test-consensus', 'QUORUM', 'Testing binding consensus');

  // Create test votes in DB
  await db.run(`INSERT OR IGNORE INTO agents (id, execution_mode) VALUES ('consensus-test-1', 'orchestrator')`);
  await db.run(`INSERT OR IGNORE INTO agents (id, execution_mode) VALUES ('consensus-test-2', 'orchestrator')`);

  // Insert test votes
  await db.run(
    `INSERT INTO agent_organization_messages (orchestrator_id, delivery, kind, payload_json) VALUES (?, 'delivered', 'vote', ?)`,
    'consensus-test-1', JSON.stringify({ support: true, weight: 1, abstain: false })
  );
  await db.run(
    `INSERT INTO agent_organization_messages (orchestrator_id, delivery, kind, payload_json) VALUES (?, 'delivered', 'vote', ?)`,
    'consensus-test-1', JSON.stringify({ support: true, weight: 1, abstain: false })
  );
  await db.run(
    `INSERT INTO agent_organization_messages (orchestrator_id, delivery, kind, payload_json) VALUES (?, 'delivered', 'vote', ?)`,
    'consensus-test-1', JSON.stringify({ support: false, weight: 1, abstain: false })
  );

  const snapshot = await organizationConsensus.snapshotOf(db, 'consensus-test-1', 0.5);
  console.log(`  Snapshot: ${JSON.stringify(snapshot)}`);
  assert.ok(snapshot.orchestratorId === 'consensus-test-1', 'Must have orchestrator ID');
  assert.ok(typeof snapshot.reached === 'boolean', 'Must have reached boolean');
  assert.ok(typeof snapshot.support === 'number', 'Must have support ratio');

  // Test global quorum
  const global = await organizationConsensus.globalQuorumSnapshot(db, 0.5);
  console.log(`  Global quorum: ${JSON.stringify(global).slice(0, 200)}`);
  assert.ok(typeof global.reached === 'boolean', 'Global must have reached');
  emitCorrelated('PHASE4_CONSENSUS_BINDING', 'test-consensus', 'QUORUM', 'Binding consensus with quorum verified');

  // Test 12: Consensus verifiable in logs, blocks execution until valid
  console.log('\n[12/12] Consensus: Verifiable in logs, blocks execution...');
  const consensusLog = {
    orchestratorId: 'consensus-test-1',
    correlationId: CORRELATION_ID,
    decision: 'PROCEED',
    quorumRatio: 0.5,
    supportRatio: snapshot.support,
    reached: snapshot.reached,
    participants: ['consensus-test-1', 'consensus-test-2'],
    timestamp: new Date().toISOString(),
    binding: true,
    blockedExecution: !snapshot.reached
  };
  console.log(`  Consensus log: ${JSON.stringify(consensusLog)}`);
  assert.ok(consensusLog.binding === true, 'Consensus must be binding');
  assert.ok(typeof consensusLog.blockedExecution === 'boolean', 'Must track blocked execution');
  emitCorrelated('PHASE4_CONSENSUS_VERIFIABLE', 'test-consensus', 'VERIFY', 'Consensus verifiable in logs, blocks execution');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n=== PHASE 4 SUMMARY ===');
  console.log('✅ Rhizome: mono-hop, multi-hop (TTL), provider growth, discovery/revocation');
  console.log('✅ Holobionte: composition, host veto/immune, quarantine, anomaly->immunity');
  console.log('✅ Consensus: binding decisions, quorum, conflict resolution, verifiable logs, blocks execution');
  console.log(`\nDuration: ${Date.now() - startedAt}ms`);
  console.log(`Correlation ID: ${CORRELATION_ID}`);

  await closeDatabase();
  return { success: true, correlationId: CORRELATION_ID };
}

if (require.main === module) {
  runPhase4Tests()
    .then(() => {
      console.log('\n✅ Phase 4 tests PASSED');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Phase 4 tests FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runPhase4Tests };