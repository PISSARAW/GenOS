/**
 * Comprehensive verification suite for GenOS gRPC Microservices & Core Services.
 * Tests proto loading, service registration, Ping health checks, and real domain RPC methods.
 */

const assert = require('assert');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const loadAllProtos = require('../proto/index');
const registerAllServices = require('../src/grpc_services/index');
const { getDatabase } = require('../src/db');
const swarmMetrics = require('../src/services/swarmMetricsService');

const TEST_PORT = 50059;
process.env.GENOS_GRPC_SHARED_SECRET = 'grpc-test-secret';

async function runGrpcSuite() {
  console.log('=== STARTING GENOS gRPC MICROSERVICES VERIFICATION SUITE ===\n');

  // 1. Boot local gRPC test server
  const server = new grpc.Server();
  const descriptors = loadAllProtos();

  console.log(`[gRPC Test] Loaded ${Object.keys(descriptors).length} proto descriptors.`);
  assert(Object.keys(descriptors).length >= 41, 'Must load at least 41 proto descriptors');

  for (const [name, desc] of Object.entries(descriptors)) {
    registerAllServices(server, desc);
  }

  await new Promise((resolve, reject) => {
    server.bindAsync(`127.0.0.1:${TEST_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) return reject(err);
      server.start();
      console.log(`[gRPC Test] Server listening on port ${port}`);
      resolve();
    });
  });

  const clients = [];
  function createClient(serviceDef) {
    const client = new serviceDef(`127.0.0.1:${TEST_PORT}`, grpc.credentials.createInsecure());
    clients.push(client);
    return client;
  }

  function callRpc(client, method, req = {}) {
    return new Promise((resolve, reject) => {
      const metadata = new grpc.Metadata();
      metadata.set('x-genos-grpc-key', 'grpc-test-secret');
      client[method](req, metadata, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  try {
    // --- 1. CoreService ---
    console.log('--- 1. Testing CoreService ---');
    const coreDesc = descriptors.core.genos.core.v1;
    const coreClient = createClient(coreDesc.CoreService);

    const corePing = await callRpc(coreClient, 'Ping');
    assert(corePing.status.includes('Core') || corePing.status.includes('alive') || corePing.status.length > 0, 'CoreService Ping failed');
    console.log(`  ✅ PASS: CoreService Ping -> "${corePing.status}"`);

    const health = await callRpc(coreClient, 'GetSystemHealth');
    assert.strictEqual(health.healthy, true, 'Health check must report healthy: true');
    console.log(`  ✅ PASS: CoreService GetSystemHealth -> healthy: ${health.healthy}, uptime: ${health.uptime}`);

    // --- 2. ArenaService ---
    console.log('\n--- 2. Testing ArenaService ---');
    const arenaDesc = descriptors.arena.genos.arena;
    const arenaClient = createClient(arenaDesc.ArenaService);

    const arenaPing = await callRpc(arenaClient, 'Ping');
    assert.strictEqual(arenaPing.status, 'Service Arena is alive via gRPC!');
    console.log(`  ✅ PASS: ArenaService Ping -> "${arenaPing.status}"`);

    const tournamentRes = await callRpc(arenaClient, 'RunTournament', { problem_id: 'test-search' });
    assert.strictEqual(tournamentRes.success, true, 'Tournament execution must succeed');
    assert(tournamentRes.winner, 'Tournament must designate a winner');
    const leaderboard = JSON.parse(tournamentRes.leaderboard_json);
    assert(Array.isArray(leaderboard) && leaderboard.length > 0, 'Leaderboard must be returned as array');
    console.log(`  ✅ PASS: ArenaService RunTournament -> Winner: ${tournamentRes.winner}, Solvers: ${leaderboard.length}`);

    const paretoRes = await callRpc(arenaClient, 'CalculatePareto', {
      candidates_json: JSON.stringify([
        { id: 'sol-1', executionTimeMs: 10, fitnessScore: 80 },
        { id: 'sol-2', executionTimeMs: 50, fitnessScore: 95 }
      ])
    });
    assert(paretoRes.pareto_count >= 1, 'Must calculate at least 1 Pareto candidate');
    console.log(`  ✅ PASS: ArenaService CalculatePareto -> ${paretoRes.pareto_count} non-dominated solutions`);

    // --- 3. MemoryService ---
    console.log('\n--- 3. Testing MemoryService ---');
    const memDesc = descriptors.memory.genos.memory.v1;
    const memClient = createClient(memDesc.MemoryService);

    const memPing = await callRpc(memClient, 'Ping');
    assert.strictEqual(memPing.status, 'Service Memory is alive via gRPC!');
    console.log(`  ✅ PASS: MemoryService Ping -> "${memPing.status}"`);

    const storeRes = await callRpc(memClient, 'StoreMemory', {
      id: 'grpc-exp-01',
      content: 'Autonomous verification test experience via gRPC',
      embedding: [0.1, 0.2, 0.3, 0.4]
    });
    assert.strictEqual(storeRes.success, true, 'StoreMemory must succeed');
    console.log('  ✅ PASS: MemoryService StoreMemory -> success: true');

    const searchRes = await callRpc(memClient, 'SearchMemory', {
      text: 'verification test',
      vector: [0.1, 0.2, 0.3, 0.4],
      limit: 3
    });
    assert(Array.isArray(searchRes.results), 'SearchMemory results must be an array');
    console.log(`  ✅ PASS: MemoryService SearchMemory -> returned ${searchRes.results.length} memories`);

    // --- 4. SwarmService ---
    console.log('\n--- 4. Testing SwarmService ---');
    const swarmDesc = descriptors.swarm.genos.swarm;
    const swarmClient = createClient(swarmDesc.SwarmService);

    const swarmPing = await callRpc(swarmClient, 'Ping');
    assert.strictEqual(swarmPing.status, 'Service Swarm is alive via gRPC!');
    console.log(`  ✅ PASS: SwarmService Ping -> "${swarmPing.status}"`);

    const swarmMetricsRes = await callRpc(swarmClient, 'GetSwarmMetrics');
    assert(typeof swarmMetricsRes.entropy === 'number', 'Entropy must be numeric');
    assert(swarmMetricsRes.state, 'State must be present');
    const db = await getDatabase();
    const metricEvents = await db.all('SELECT action as type, event_type as action, agent_id FROM telemetry_events ORDER BY id DESC LIMIT 50');
    const expectedMetrics = swarmMetrics.calculateShannonEntropy(metricEvents);
    assert(Math.abs(swarmMetricsRes.entropy - expectedMetrics.rawEntropy) < 0.0001, 'Swarm gRPC entropy must match persisted telemetry');
    assert.strictEqual(swarmMetricsRes.state, expectedMetrics.cognitiveDriftState, 'Swarm gRPC state must match persisted telemetry');
    console.log(`  ✅ PASS: SwarmService GetSwarmMetrics -> state: ${swarmMetricsRes.state}, entropy: ${swarmMetricsRes.entropy}`);

    const swarmTopologyRes = await callRpc(swarmClient, 'GetSwarmTopology');
    assert(swarmTopologyRes.topology_json, 'Topology JSON must be returned');
    const topologyAgents = await db.all(`
      SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
        fleet_id as fleetId, parent_agent_id as parentAgentId
      FROM agents WHERE status != 'terminated'
    `);
    const topologyEvents = await db.all('SELECT id, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100');
    const expectedTopology = swarmMetrics.getSwarmTopology(topologyAgents, topologyEvents);
    assert.deepStrictEqual(swarmTopologyRes.node_ids.sort(), expectedTopology.nodes.map((node) => node.id).sort(), 'Swarm gRPC topology must contain persisted agent nodes');
    console.log(`  ✅ PASS: SwarmService GetSwarmTopology -> nodes: ${swarmTopologyRes.node_ids.length}`);

    // --- 5. ResilienceService ---
    console.log('\n--- 5. Testing ResilienceService ---');
    const resDesc = descriptors.resilience.genos.resilience;
    const resClient = createClient(resDesc.ResilienceService);

    const resPing = await callRpc(resClient, 'Ping');
    assert.strictEqual(resPing.status, 'Service Resilience is alive via gRPC!');
    console.log(`  ✅ PASS: ResilienceService Ping -> "${resPing.status}"`);

    const freezeRes = await callRpc(resClient, 'FreezeState', {
      agent_id: 'agent-cryptobiosis-01',
      state_json: JSON.stringify({ mission: 'test', memoryCount: 42 })
    });
    assert(freezeRes.frozen === true, 'FreezeState must freeze successfully');
    assert(freezeRes.snapshot_id, 'FreezeState must return snapshotId');
    console.log(`  ✅ PASS: ResilienceService FreezeState -> snapshotId: ${freezeRes.snapshot_id}`);

    const thawRes = await callRpc(resClient, 'ThawState', { snapshot_id: freezeRes.snapshot_id });
    assert.strictEqual(thawRes.agent_id, 'agent-cryptobiosis-01');
    console.log(`  ✅ PASS: ResilienceService ThawState -> restored agentId: ${thawRes.agent_id}`);

    // --- 6. RustBridgeService ---
    console.log('\n--- 6. Testing RustBridgeService ---');
    const rustDesc = descriptors.rustBridge.genos.rustBridge;
    const rustClient = createClient(rustDesc.RustBridgeService);

    const rustPing = await callRpc(rustClient, 'Ping');
    assert.strictEqual(rustPing.status, 'Service RustBridge is alive via gRPC!');
    console.log(`  ✅ PASS: RustBridgeService Ping -> "${rustPing.status}"`);

    const bridgeHealth = await callRpc(rustClient, 'CheckBridgeHealth');
    assert(bridgeHealth.version.includes('GenOS'), 'Version must identify GenOS');
    console.log(`  ✅ PASS: RustBridgeService CheckBridgeHealth -> healthy: ${bridgeHealth.healthy}, path: ${bridgeHealth.binary_path}`);

    // --- 7. TelemetryService ---
    console.log('\n--- 7. Testing TelemetryService ---');
    const telDesc = descriptors.telemetry.genos.telemetry.v1;
    const telClient = createClient(telDesc.TelemetryService);

    const telPing = await callRpc(telClient, 'Ping');
    assert.strictEqual(telPing.status, 'Service Telemetry is alive via gRPC!');
    console.log(`  ✅ PASS: TelemetryService Ping -> "${telPing.status}"`);

    const emitRes = await callRpc(telClient, 'EmitEvent', {
      agent_id: 'agent-grpc-test',
      event_type: 'GRPC_TEST_EVENT',
      action: 'PING',
      detail: 'gRPC event stream verified',
      severity: 'info',
      status: 'active',
      payload_json: JSON.stringify({ verified: true })
    });
    assert.strictEqual(emitRes.success, true);
    console.log('  ✅ PASS: TelemetryService EmitEvent -> success: true');

    // --- 8. WorkspaceService ---
    console.log('\n--- 8. Testing WorkspaceService ---');
    const wsDesc = descriptors.workspace.genos.workspace.v1;
    const wsClient = createClient(wsDesc.WorkspaceService);

    const wsPing = await callRpc(wsClient, 'Ping');
    assert.strictEqual(wsPing.status, 'Service Workspace is alive via gRPC!');
    console.log(`  ✅ PASS: WorkspaceService Ping -> "${wsPing.status}"`);

    const provRes = await callRpc(wsClient, 'ProvisionWorkspace', {
      workspace_id: 'ws-test-identity',
      isolation_mode: 'Branch'
    });
    assert(provRes.workspace_root, 'Must return workspace_root');
    console.log(`  ✅ PASS: WorkspaceService ProvisionWorkspace -> root: ${provRes.workspace_root}`);

    // --- 9. AgentService & OrchestratorService ---
    console.log('\n--- 9. Testing AgentService & OrchestratorService ---');
    const agentDesc = descriptors.agent.genos.agent.v1;
    const agentClient = createClient(agentDesc.AgentService);
    const stopRes = await callRpc(agentClient, 'StopMission', { id: 'agent-stop-test' });
    assert.strictEqual(stopRes.stopped, false);
    console.log(`  ✅ PASS: AgentService StopMission -> stopped: ${stopRes.stopped}`);

    const orchDesc = descriptors.orchestrator.genos.orchestrator.v1;
    const orchClient = createClient(orchDesc.OrchestratorService);
    const orchRes = await callRpc(orchClient, 'DispatchWorker', {
      orchestrator_id: 'orch-prime',
      worker_id: 'worker-sub-1',
      prompt: 'Verify gRPC fleet dispatch'
    });
    assert.strictEqual(orchRes.success, true);
    console.log(`  ✅ PASS: OrchestratorService DispatchWorker -> status: ${orchRes.status}`);

    // --- 10. McpService ---
    console.log('\n--- 10. Testing McpService ---');
    const mcpDesc = descriptors.mcp.genos.mcp;
    const mcpClient = createClient(mcpDesc.McpService);
    const mcpPing = await callRpc(mcpClient, 'Ping');
    assert.strictEqual(mcpPing.status, 'Service Mcp is alive via gRPC!');
    console.log(`  ✅ PASS: McpService Ping -> "${mcpPing.status}"`);

    const toolsList = await callRpc(mcpClient, 'ListTools');
    assert(Array.isArray(toolsList.tools), 'Tools must be an array');
    console.log(`  ✅ PASS: McpService ListTools -> ${toolsList.tools.length} tools registered`);

    // --- 11. Testing Ping on All 41 Services ---
    console.log('\n--- 11. Testing Universal Health (Ping) Across All 41 Microservices ---');
    let pingedCount = 0;
    function findServiceDefs(obj) {
      const defs = [];
      for (const k in obj) {
        const val = obj[k];
        if (val && (typeof val === 'function' || typeof val === 'object')) {
          if (val.service) defs.push({ name: k, def: val });
          else defs.push(...findServiceDefs(val));
        }
      }
      return defs;
    }

    for (const [modName, desc] of Object.entries(descriptors)) {
      for (const { name, def } of findServiceDefs(desc)) {
        const client = createClient(def);
        const res = await callRpc(client, 'Ping');
        assert(res.status, `Ping on ${name} must return status`);
        pingedCount++;
      }
    }
    console.log(`  ✅ PASS: 100% of all ${pingedCount} gRPC microservices responded to Ping`);

    console.log('\n========================================');
    console.log(`ALL 41 gRPC MICROSERVICES & CORE SERVICES PASSED (${pingedCount} SERVICES VERIFIED)`);
    console.log('========================================\n');
  } finally {
    for (const c of clients) {
      c.close();
    }
    server.forceShutdown();
  }
}

if (require.main === module) {
  runGrpcSuite().catch((err) => {
    console.error('FAILED gRPC test suite:', err);
    process.exit(1);
  });
}

module.exports = { runGrpcSuite };
