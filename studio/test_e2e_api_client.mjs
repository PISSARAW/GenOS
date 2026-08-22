/**
 * GenOS Studio Comprehensive E2E API & Error Resilience Verification Harness
 * Tests studio/src/api/client.ts, 18 Endpoint Schemas, 7 Innovation Modules,
 * SSE Telemetry Streaming, and useToastStore Error Handling against live backend.
 */

import http from 'http';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import { createRequire } from 'module';

import { runPart2 } from './test_e2e_api_client_part2.mjs';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory localStorage mock for Node.js
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear()
};

// Use an ephemeral test-only administrator token inherited by the backend.
const ADMIN_TEST_TOKEN = `genos_test_admin_${crypto.randomBytes(16).toString('hex')}`;
process.env.GENOS_ADMIN_TOKEN = ADMIN_TEST_TOKEN;
globalThis.localStorage.setItem('genos_auth_token', ADMIN_TEST_TOKEN);
globalThis.localStorage.setItem('genos_csrf_token', 'csrf-e2e-challenger-2-token');

// Compile and load client.ts and useToastStore.ts dynamically
function loadTsModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const compiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  const moduleObj = { exports: {} };
  const fn = new Function('require', 'exports', 'module', compiled);
  
  const customRequire = (specifier) => {
    if (specifier === 'zustand') {
      return {
        create: (fnState) => {
          let state;
          const listeners = new Set();
          const setState = (partial) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
            listeners.forEach(l => l(state));
          };
          const getState = () => state;
          const subscribe = (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          };
          state = fnState(setState, getState, { setState, getState, subscribe });
          const useStore = (selector = (s) => s) => selector(state);
          useStore.getState = getState;
          useStore.setState = setState;
          useStore.subscribe = subscribe;
          return useStore;
        }
      };
    }
    if (specifier.endsWith('useToastStore')) {
      return loadTsModule(path.resolve(__dirname, 'src/store/useToastStore.ts'));
    }
    return require(specifier);
  };

  fn(customRequire, moduleObj.exports, moduleObj);
  return moduleObj.exports;
}

const clientModule = loadTsModule(path.resolve(__dirname, 'src/api/client.ts'));
const { api, apiRequest, API_BASE_URL } = clientModule;
const toastModule = loadTsModule(path.resolve(__dirname, 'src/store/useToastStore.ts'));
const { useToastStore } = toastModule;

// E2E Test Runner State
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = [];
let discoveredVulnerabilities = [];
let backendServerInstance = null;

function assert(condition, message, details = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    const err = `[FAIL] ${message} | ${details}`;
    failedAssertions.push(err);
    console.error(`  ${err}`);
  }
}

function recordVulnerability(title, description, payload, error) {
  discoveredVulnerabilities.push({ title, description, payload, error: error?.message || String(error) });
  console.log(`  ⚠️ [VULNERABILITY DISCOVERED] ${title}: ${error?.message || error}`);
}

async function resetAndSeedDatabase() {
  const dbPath = path.resolve(__dirname, '../backend/genos.db');
  for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }
  }
  const { getDatabase } = require(path.resolve(__dirname, '../backend/src/db'));
  await getDatabase();
}

async function ensureBackendRunning() {
  const isPortOpen = await new Promise((resolve) => {
    const req = http.request({ hostname: 'localhost', port: 4000, path: '/api/health', method: 'GET', timeout: 800 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });

  if (isPortOpen) {
    console.log('Backend server is already actively listening on port 4000.\n');
    return;
  }

  await resetAndSeedDatabase();

  console.log('Starting GenOS backend server on port 4000 for E2E testing...');
  const backendServerPath = path.resolve(__dirname, '../backend/server.js');
  const { startServer } = require(backendServerPath);
  const serverObj = await startServer();
  backendServerInstance = serverObj.server;
  console.log('Backend server initialized successfully on port 4000.\n');
}

async function runE2EVerification() {
  await ensureBackendRunning();

  console.log('===============================================================');
  console.log(' GENOS STUDIO FRONTEND E2E API & CLIENT VERIFICATION HARNESS');
  console.log('===============================================================');
  console.log(`Testing frontend api client against ${API_BASE_URL}...\n`);

  // Section 1: Auth & RBAC Endpoints
  console.log('--- 1. Auth & Session Management ---');
  try {
    const verifyValid = await api.verifyToken(ADMIN_TEST_TOKEN);
    assert(verifyValid.valid === true && verifyValid.role === 'admin', 'api.verifyToken() succeeds with military override token');

    let rejectInvalid = false;
    try {
      await api.verifyToken('completely-invalid-key');
    } catch (e) {
      rejectInvalid = true;
      assert(e.message.toLowerCase().includes('401') || e.message.toLowerCase().includes('invalid') || e.message.toLowerCase().includes('unauthorized') || e.message.toLowerCase().includes('token'), `api.verifyToken() rejects invalid key cleanly (Error: "${e.message}")`);
    }
    assert(rejectInvalid, 'Invalid token threw exception as expected');

    const session = await api.getSession();
    assert(session.user && session.user.role === 'admin', 'api.getSession() returns active admin session profile');
  } catch (err) {
    assert(false, 'Auth & Session Section Exception', err.message);
  }

  // Section 2: Config, User Profile & Budget
  console.log('\n--- 2. Config, User Profile & Budget ---');
  try {
    const config = await api.getConfig();
    assert(config.version !== undefined && config.environment !== undefined, 'api.getConfig() returns version and environment config');

    const updatedProfile = await api.updateProfile('Challenger2_Lead_Auditor');
    assert(updatedProfile.username === 'Challenger2_Lead_Auditor', 'api.updateProfile() successfully updates user profile');

    const budget = await api.getBudget();
    assert(budget !== undefined, 'api.getBudget() returns budget allocation data');

    const updatedBudget = await api.updateBudget({ maxDailySpend: 500, currency: 'USD' });
    assert(updatedBudget.success === true || updatedBudget.maxDailySpend === 500, 'api.updateBudget() applies new budget constraints');
  } catch (err) {
    assert(false, 'Config & Budget Section Exception', err.message);
  }

  // Section 3: Agent Deployment Fleet
  console.log('\n--- 3. Agent Fleet Deployment & Tracking ---');
  try {
    const agents = await api.listAgents();
    assert(Array.isArray(agents) && agents.length > 0, `api.listAgents() returns array of active agents (count: ${agents.length})`);

    const deployRes = await api.deployAgent({
      prompt: 'E2E Empirical Challenger Subagent',
      modelTier: 'Tier-1-Strict',
      workspaceIsolation: 'Sandbox-VFS'
    });
    assert(deployRes.success === true && deployRes.agentId !== undefined, `api.deployAgent() deployed agent successfully (ID: ${deployRes.agentId})`);

    const trinityRes = await api.deployTrinity({
      prompt: 'Trinity Swarm Verification Node',
      worlds: ['Arena-1', 'Arena-2', 'Arena-3']
    });
    assert(trinityRes.success === true, 'api.deployTrinity() successfully deployed multi-agent Trinity swarm');

    const history = await api.getAgentHistory();
    assert(Array.isArray(history) && history.length > 0, `api.getAgentHistory() returns deployment history (count: ${history.length})`);

    const pingRes = await api.pingAgent(agents[0]?.id || 'agent-orchestrator');
    assert(pingRes.status === 'pong' || pingRes.success === true || pingRes.alive === true, `api.pingAgent() confirms target agent heartbeat (pong, latency: ${pingRes.latencyMs}ms)`);
  } catch (err) {
    assert(false, 'Agent Deployment Section Exception', err.message);
  }

  // Section 4: Workspaces & Time Machine Snapshots
  console.log('\n--- 4. Workspaces & Time Machine Snapshots ---');
  try {
    const workspaces = await api.listWorkspaces();
    assert(Array.isArray(workspaces) && workspaces.length > 0, `api.listWorkspaces() returned ${workspaces.length} workspaces`);

    const newWs = await api.createWorkspace('Challenger-E2E-Workspace', 'Created during empirical E2E test run');
    assert(newWs.success === true && (newWs.workspace?.id || newWs.workspaceId), `api.createWorkspace() created workspace (ID: ${newWs.workspace?.id || newWs.workspaceId})`);

    const wsDetails = await api.getWorkspace('ws-genos-core');
    assert((wsDetails.workspace?.id === 'ws-genos-core' || wsDetails.id === 'ws-genos-core'), 'api.getWorkspace("ws-genos-core") returned full workspace metadata');

    const snapshots = await api.getSnapshots('ws-genos-core');
    assert(Array.isArray(snapshots) && snapshots.length > 0, `api.getSnapshots() returned ${snapshots.length} snapshots`);

    const createdSnap = await api.createSnapshot('ws-genos-core', {
      label: 'E2E Pre-Verification Snapshot',
      reason: 'Automated Challenger 2 E2E snapshot assertion'
    });
    assert(createdSnap.success === true && (createdSnap.snapshot?.stepNumber !== undefined || createdSnap.step_number !== undefined), `api.createSnapshot() created snapshot step #${createdSnap.snapshot?.stepNumber || createdSnap.step_number}`);

    const restoreRes = await api.restoreSnapshot('ws-genos-core', 1);
    assert(restoreRes.success === true, 'api.restoreSnapshot() restored workspace checkpoint');
  } catch (err) {
    assert(false, 'Workspaces Section Exception', err.message);
  }

  // Section 5: Lineage DAG & Genome Synthesis
  console.log('\n--- 5. Lineage DAG & Genome Synthesis ---');
  try {
    const lineage = await api.getLineage();
    assert(Array.isArray(lineage.nodes) && Array.isArray(lineage.edges) && lineage.nodes.length > 0, `api.getLineage() returned DAG with ${lineage.nodes.length} nodes & ${lineage.edges.length} edges`);

    const rootNode = lineage.nodes[0] || { id: 'node-root' };
    const inspectNode = await api.inspectNode(rootNode.id);
    assert(inspectNode.nodeId !== undefined || inspectNode.id !== undefined, `api.inspectNode() retrieved node execution context for ${inspectNode.nodeId || inspectNode.id}`);

    const cloneRes = await api.cloneNode(rootNode.id);
    assert(cloneRes.success === true && cloneRes.clonedNodeId !== undefined, `api.cloneNode() spawned cloned node ${cloneRes.clonedNodeId}`);

    const killRes = await api.killNode(cloneRes.clonedNodeId);
    assert(killRes.success === true, `api.killNode() safely terminated node ${cloneRes.clonedNodeId}`);

    const genomeGraph = await api.getGenomeGraph();
    assert(genomeGraph !== undefined && (genomeGraph.nodes || genomeGraph.branches), 'api.getGenomeGraph() returned phylogenetic tree structure');

    const synthRes = await api.synthesizeGenome({
      title: 'E2E Synthetic Genetic Code',
      content: 'Recombination of heuristics vector A and B',
      cart: ['node-root']
    });
    assert(synthRes.status === 'synthesized' || synthRes.success === true, 'api.synthesizeGenome() generated new genome trait');

    const decisionRes = await api.recordDecision({
      title: 'Empirical Verification Decision #1',
      content: 'Approved zero-emoji and zero-gradient frontend UI strict enforcement',
      category: 'Governance'
    });
    assert(decisionRes.success === true, 'api.recordDecision() persisted architectural decision record');
  } catch (err) {
    assert(false, 'Lineage DAG Section Exception', err.message);
  }

  // Section 6: Trajectories & Verification Queue
  console.log('\n--- 6. Trajectories Queue & Actions ---');
  try {
    const trajectories = await api.getTrajectories();
    assert(trajectories.pendingList !== undefined && trajectories.activeList !== undefined, 'api.getTrajectories() returned trajectory registry with pending and active lists');

    const pending = await api.getPendingTrajectories();
    assert(Array.isArray(pending) && pending.length > 0, `api.getPendingTrajectories() returned ${pending.length} pending items`);

    const active = await api.getActiveTrajectories();
    assert(Array.isArray(active) && active.length > 0, `api.getActiveTrajectories() returned ${active.length} active trajectories`);

    const targetTraj = pending[0]?.id || 'traj-001';
    const approveRes = await api.approveTrajectory(targetTraj);
    assert(approveRes.success === true, `api.approveTrajectory("${targetTraj}") successfully merged trajectory`);

    const rejectRes = await api.rejectTrajectory('traj-002', 'Rejected due to empirical drift');
    assert(rejectRes.success === true, 'api.rejectTrajectory("traj-002") recorded rejection with justification');

    const reviseRes = await api.reviseTrajectory('traj-001', 'Requested parameter tuning');
    assert(reviseRes.success === true, 'api.reviseTrajectory("traj-001") updated trajectory revision notes');
  } catch (err) {
    assert(false, 'Trajectories Section Exception', err.message);
  }

  // Section 7: Swarm Consensus & Quorum Voting
  console.log('\n--- 7. Swarm Consensus & Quorum Voting ---');
  try {
    const consensus = await api.getConsensus();
    assert(Array.isArray(consensus.proposals) && consensus.proposals.length > 0, `api.getConsensus() returned proposals list (count: ${consensus.proposals.length})`);

    const newProposal = await api.createProposal({
      title: 'Empirical Verification Swarm Quorum #99',
      description: 'Require all frontend components to undergo automated static and E2E gates',
      quorumThreshold: 0.8
    });
    assert(newProposal.success === true && newProposal.proposalId !== undefined, `api.createProposal() registered proposal ${newProposal.proposalId}`);

    const voteRes = await api.castVote({
      proposalId: newProposal.proposalId || 'prop-001',
      vote: 'yes',
      agentId: 'challenger_2_agent',
      reason: 'All E2E checks passing'
    });
    assert(voteRes.success === true, 'api.castVote() cast and recorded yes vote in SQLite quorum table');
  } catch (err) {
    assert(false, 'Swarm Consensus Section Exception', err.message);
  }

  // Section 8: MCP Arsenal & Circuit Breaker Isolation
  console.log('\n--- 8. MCP Arsenal & Circuit Breaker ---');
  try {
    const tools = await api.listTools();
    assert(Array.isArray(tools) && tools.length >= 40, `api.listTools() returned ${tools.length} available MCP tools (>= 40 required)`);

    const testToolRes = await api.testTool('genos_inspect', { path: 'src/App.tsx' });
    assert(testToolRes.success === true, 'api.testTool("genos_inspect") executed safely in dry-run sandbox');

    const execToolRes = await api.executeTool('genos_inspect', { path: 'src/App.tsx' });
    assert(execToolRes.success === true || execToolRes.output !== undefined, 'api.executeTool("genos_inspect") executed tool');

    // Quarantine Circuit Breaker Test
    const lockRes = await api.toggleCircuitBreaker('genos_merge', true);
    assert(lockRes.isLocked === true || lockRes.success === true, 'api.toggleCircuitBreaker("genos_merge", true) successfully locked tool');

    let lockedBlocked = false;
    try {
      await api.executeTool('genos_merge', { source: 'branch-a', target: 'main' });
    } catch (e) {
      lockedBlocked = true;
      assert(e.message.toLowerCase().includes('503') || e.message.toLowerCase().includes('circuit breaker') || e.message.toLowerCase().includes('quarantine') || e.message.toLowerCase().includes('locked') || e.message.toLowerCase().includes('circuit_breaker_quarantine'), `Executing locked tool returns Circuit Breaker rejection (Message: "${e.message}")`);
    }
    assert(lockedBlocked, 'Locked MCP tool was rejected by Circuit Breaker middleware');

    // Unlock Circuit Breaker
    const unlockRes = await api.toggleCircuitBreaker('genos_merge', false);
    assert(unlockRes.isLocked === false || unlockRes.success === true, 'api.toggleCircuitBreaker("genos_merge", false) unlocked tool');

    const equipRes = await api.equipTool('genos_inspect', ['agent-orchestrator', 'agent-backend']);
    assert(equipRes.success === true, 'api.equipTool() equipped tools to target agent fleet');
  } catch (err) {
    assert(false, 'MCP Tools Section Exception', err.message);
  }

  await runPart2(api, apiRequest, assert, ADMIN_TEST_TOKEN, useToastStore);
  // Summary
  console.log('\n===============================================================');
  console.log(` E2E API & RESILIENCE AUDIT SUMMARY:`);
  console.log(` Total Assertions: ${totalAssertions}`);
  console.log(` Passed: ${passedAssertions}`);
  console.log(` Failed: ${failedAssertions.length}`);
  console.log(` Discovered Vulnerabilities: ${discoveredVulnerabilities.length}`);
  console.log(` Overall E2E Status: ${failedAssertions.length === 0 ? '100% PASS' : 'FAILURES DETECTED'}`);
  console.log('===============================================================');

  return { passed: failedAssertions.length === 0, totalAssertions, passedAssertions, failedAssertions, discoveredVulnerabilities };
}

runE2EVerification()
  .then(res => {
    if (backendServerInstance) {
      backendServerInstance.close();
    }
    if (!res.passed) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(err => {
    if (backendServerInstance) {
      backendServerInstance.close();
    }
    console.error('Fatal E2E Runner Error:', err);
    process.exit(1);
  });
