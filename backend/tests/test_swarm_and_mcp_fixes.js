const assert = require('assert');
process.env.GENOS_ADMIN_PASSWORD = 'TestPassword123!';
process.env.GENOS_ADMIN_TOKEN = 'TestAdminToken123!';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const { parseCommandLine } = require('../src/services/genosCli');
const { handleEvaporation } = require('../src/services/mcpBioTools/handlers/evaporation');
const { handleTrailSelection } = require('../src/services/mcpBioTools/handlers/trailSelection');
const { handleSynapticPruneScale } = require('../src/services/mcpBioTools/handlers/synapticPruneScale');
const { handleStigmergy } = require('../src/services/mcpBioTools/handlers/stigmergy');

async function testSwarmQuorumLogic() {
  const swarmController = require('../src/controllers/swarmController');
  
  // Test via simulated HTTP requests
  const tmpDbPath = path.join(os.tmpdir(), `test-swarm-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = await getDatabase(tmpDbPath);
  try {
    // Setup organization, project, workspace and 4 active agents
    await db.run("INSERT INTO organizations (id, name) VALUES ('org-1', 'Org 1')");
    await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('proj-1', 'org-1', 'Proj 1')");
    await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('ws-swarm', 'Swarm WS', '/tmp/swarm', 'org-1', 'proj-1')");
    for (let i = 1; i <= 4; i++) {
      await db.run(`INSERT INTO agents (id, name, role, status, workspace_id) VALUES ('agent-${i}', 'Agent ${i}', 'worker', 'running', 'ws-swarm')`);
    }

    // Create proposal
    const reqCreate = {
      body: { title: 'Activate Super Highway', quorumThreshold: 0.6, workspaceId: 'ws-swarm' },
      user: { username: 'admin', keyId: 'admin' },
      tenant: { organizationId: 'org-1', projectId: 'proj-1' }
    };
    let createdProposalId;
    const resCreate = {
      status: (code) => ({
        json: (data) => {
          assert.strictEqual(code, 201);
          createdProposalId = data.proposalId;
        }
      })
    };
    await swarmController.createProposal(reqCreate, resCreate);
    assert(createdProposalId, 'Proposal should be created');

    // Cast 2 'yes' votes out of 4 agents (50% participation = 2 votes required, 100% approval >= 0.6 threshold)
    for (let i = 1; i <= 2; i++) {
      let voteResponse;
      const reqVote = {
        body: { proposalId: createdProposalId, vote: 'yes', agentId: `agent-${i}` },
        user: { role: 'admin' },
        tenant: { organizationId: 'org-1', projectId: 'proj-1' }
      };
      const resVote = {
        status(code) { this.statusCode = code; return this; },
        json(data) { voteResponse = data; return this; }
      };
      await swarmController.castVote(reqVote, resVote);
      assert.strictEqual(voteResponse?.success, true, `Vote should succeed: ${JSON.stringify(voteResponse)}`);
    }

    // Check proposal status in database: it MUST have transitioned to 'passed' thanks to positional quorum check!
    const propRow = await db.get("SELECT status FROM swarm_proposals WHERE id = ?", createdProposalId);
    assert.strictEqual(propRow.status, 'passed', `Proposal status must be 'passed', got '${propRow.status}'`);
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
  }
}

async function testMcpBioToolsExecution() {
  // Test handleEvaporation with empty/dummy strategyAdapter fallback
  const evapRes = await handleEvaporation({ agent_id: 'test-agent' });
  assert.strictEqual(typeof evapRes, 'object');
  assert.strictEqual(evapRes.configured, true);

  // Test handleTrailSelection
  const trailRes = await handleTrailSelection({ agent_id: 'test-agent' });
  assert.strictEqual(typeof trailRes, 'object');
  assert.strictEqual(trailRes.configured, true);

  // Test handleStigmergy sanitization
  let executedCmd = null;
  const mockRun = (cmd) => {
    executedCmd = cmd;
    return 'ok';
  };
  const stigRes = handleStigmergy({ action: 'read', target_file: 'C:\\test\\path.txt' }, mockRun);
  assert.strictEqual(stigRes.success, true);
  assert(executedCmd.includes('--target-file "C:\\\\test\\\\path.txt"'));

  const missingFileRes = handleStigmergy({ action: 'read' }, mockRun);
  assert.strictEqual(missingFileRes.success, false);
  assert.strictEqual(missingFileRes.status, 'tool_error');
}

async function testSynapticPruneScaleMultiTenantProtection() {
  const tmpDbPath = path.join(os.tmpdir(), `test-prune-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = await getDatabase(tmpDbPath);
  try {
    // Insert decisions in different tenants
    // 1. Tenant A - core memory (protected)
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by, organization_id, project_id) VALUES ('core-mem', 'Core Invariant', 'Always guard', 0.05, 'core', 'system', 'tenant-a', 'proj-a')");
    // 2. Tenant A - transient memory (should be pruned by tenant A)
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by, organization_id, project_id) VALUES ('transient-a', 'Guess A', 'Temp note', 0.05, 'temporary', 'system', 'tenant-a', 'proj-a')");
    // 3. Tenant B - transient memory (must NOT be pruned by tenant A)
    await db.run("INSERT INTO genome_decisions (id, title, content, synaptic_weight, category, created_by, organization_id, project_id) VALUES ('transient-b', 'Guess B', 'Temp note', 0.05, 'temporary', 'system', 'tenant-b', 'proj-b')");

    // Execute prune for tenant A
    const pruneRes = await handleSynapticPruneScale(
      { organization_id: 'tenant-a', project_id: 'proj-a' },
      null,
      async () => db
    );
    assert.strictEqual(pruneRes.success, true);

    const coreRow = await db.get("SELECT * FROM genome_decisions WHERE id = 'core-mem'");
    const transARow = await db.get("SELECT * FROM genome_decisions WHERE id = 'transient-a'");
    const transBRow = await db.get("SELECT * FROM genome_decisions WHERE id = 'transient-b'");

    assert(coreRow !== undefined, 'Core memory must be preserved even with synaptic_weight < 0.1');
    assert.strictEqual(transARow, undefined, 'Tenant A transient memory must be pruned');
    assert(transBRow !== undefined, 'Tenant B memory must NOT be pruned by Tenant A prune call (multi-tenant isolation)');
  } finally {
    await closeDatabase();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
  }
}

function testWindowsCliBackslashPreservation() {
  const winCmd = 'genos command --target-file "C:\\Users\\Developer\\Documents\\GitHub\\GenOS\\test.txt" --name "Alice"';
  const parsed = parseCommandLine(winCmd);
  assert.strictEqual(parsed[0], 'genos');
  assert.strictEqual(parsed[1], 'command');
  assert.strictEqual(parsed[2], '--target-file');
  assert.strictEqual(parsed[3], 'C:\\Users\\Developer\\Documents\\GitHub\\GenOS\\test.txt', 'Windows path backslashes must be preserved intact');
  assert.strictEqual(parsed[4], '--name');
  assert.strictEqual(parsed[5], 'Alice');

  const escapeQuoteCmd = 'genos test --quote "He said \\"hello\\""';
  const parsedQuote = parseCommandLine(escapeQuoteCmd);
  assert.strictEqual(parsedQuote[3], 'He said "hello"', 'Escaped quotes inside double-quotes must unescape properly');
}

async function runAll() {
  console.log('Running Swarm, MCP, and CLI fixes verification suite...');
  await testSwarmQuorumLogic();
  console.log('  ✓ testSwarmQuorumLogic passed');
  await testMcpBioToolsExecution();
  console.log('  ✓ testMcpBioToolsExecution passed');
  await testSynapticPruneScaleMultiTenantProtection();
  console.log('  ✓ testSynapticPruneScaleMultiTenantProtection passed');
  testWindowsCliBackslashPreservation();
  console.log('  ✓ testWindowsCliBackslashPreservation passed');
  console.log('All new bug fixes verified successfully!');
}

runAll().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
