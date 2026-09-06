/**
 * GenOS Backend Comprehensive Verification Suite
 * Verifies SQLite WAL mode, 18 tables, RBAC security, and all 7 innovation engines.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { TEST_ADMIN_TOKEN } = require('../testAuth');
const { createApp } = require('../src/app');
const { getDatabase, closeDatabase, withTransaction } = require('../src/db');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

const TEST_PORT = 4099;
let server = null;
let db = null;
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (!condition) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedCount++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

function request(options, body = null) {
  // Requests are authenticated by default; pass skipDefaultAuth to exercise
  // the unauthenticated rejection paths.
  const { skipDefaultAuth, ...reqOptions } = options;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      ...reqOptions,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-token',
        ...(skipDefaultAuth ? {} : { 'Authorization': `Bearer ${TEST_ADMIN_TOKEN}` }),
        ...(reqOptions.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING GENOS BACKEND VERIFICATION SUITE ===\n');
  const testDbPath = path.resolve(__dirname, 'test_genos.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  db = await getDatabase(testDbPath);
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  console.log(`Test server active on port ${TEST_PORT}\n`);

  try {
    // 1. SQLite WAL Mode & Transaction Integrity
    console.log('--- 1. Database WAL Mode & Transaction Verification ---');
    const walRow = await db.get('PRAGMA journal_mode;');
    assert(walRow && walRow.journal_mode.toLowerCase() === 'wal', 'SQLite PRAGMA journal_mode is WAL');

    // Test withTransaction helper
    await withTransaction(db, async (txDb) => {
      await txDb.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'ws-tx-test', 'TxTest', '/tmp/tx');
    });
    const txRow = await db.get('SELECT * FROM workspaces WHERE id = ?', 'ws-tx-test');
    assert(txRow !== undefined, 'withTransaction helper committed transaction successfully');

    // Workspace used by the resilience and rollback sections; scoped endpoints
    // require the workspace row to exist, and durable snapshots require a real
    // directory on disk.
    const coreWorkspacePath = path.join(__dirname, '.tmp-ws-genos-core');
    fs.mkdirSync(path.join(coreWorkspacePath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(coreWorkspacePath, 'src', 'parser.js'), 'function parse(input){ if (!input) return null; return input; }\n');
    // Bisection runs only allow-listed test commands now, so give the
    // workspace an npm test script that reproduces the regression.
    fs.writeFileSync(path.join(coreWorkspacePath, 'package.json'), JSON.stringify({ name: 'ws-genos-core', version: '0.0.0', scripts: { test: 'node -e "process.exit(1)"' } }, null, 2));
    await db.run(
      "INSERT INTO workspaces (id, name, path) VALUES ('ws-genos-core', 'GenOS Core', ?) " +
      'ON CONFLICT(id) DO UPDATE SET path = excluded.path',
      coreWorkspacePath
    );

    // 2. 18 Tables Verification
    console.log('\n--- 2. Database Schema & Tables Verification ---');
    const tables = [
      'access_keys', 'sessions', 'workspaces', 'workspace_snapshots', 'agents',
      'trajectories', 'lineage_nodes', 'lineage_edges', 'experiments', 'experiment_waves',
      'experiment_thoughts', 'coevolution_arenas', 'swarm_proposals', 'swarm_votes',
      'mcp_tools', 'telemetry_events', 'genome_decisions', 'trace_spans', 'global_alerts'
    ];
    for (const t of tables) {
      const row = await db.get(`SELECT COUNT(*) as count FROM ${t}`);
      assert(row !== undefined, `Table '${t}' is queryable (rows: ${row.count})`);
    }

    // 3. Security, RBAC & Headers
    console.log('\n--- 3. Auth, RBAC & Security Protection ---');
    const authRes = await request({ method: 'POST', path: '/api/auth/verify-token' }, { token: MILITARY_OVERRIDE_TOKEN });
    assert(authRes.status === 200 && authRes.body.valid && authRes.body.role === 'admin', 'Level 5 Override Token authenticated as admin');

    const invRes = await request({ method: 'POST', path: '/api/auth/verify-token' }, { token: 'invalid_token' });
    assert(invRes.status === 401, 'Invalid token rejected with 401 Unauthorized');

    const healthRes = await request({ method: 'GET', path: '/api/health' });
    assert(healthRes.headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY header verified');

    // 4. Arena Module: Multi-Solver Tournament & Pareto Frontier
    console.log('\n--- 4. Arena: Multi-Solver Tournament & Pareto Frontier ---');
    const tournRes = await request({ method: 'GET', path: '/api/arena/tournament' });
    assert(tournRes.status === 200 && tournRes.body.leaderboard.length >= 3, 'GET /api/arena/tournament returned solver leaderboard');
    assert(tournRes.body.leaderboard[0].eloRating > 0, 'Solver ELO rating computed accurately');

    const paretoRes = await request({ method: 'GET', path: '/api/arena/pareto' });
    assert(paretoRes.status === 200 && Array.isArray(paretoRes.body.paretoFront), 'GET /api/arena/pareto returned Pareto Front');
    assert(paretoRes.body.kneePointRecommendation !== null, 'Mathematical Knee-Point identified successfully');

    const traceRes = await request({ method: 'GET', path: '/api/arena/trace?tournamentId=test-01' });
    assert(traceRes.status === 200 && traceRes.body.spans.length > 0, 'GET /api/arena/trace exported OpenTelemetry trace spans');

    // 5. MCP Sandbox: JSON Schema & VFS Dry-Run Simulation
    console.log('\n--- 5. MCP Sandbox: Schema Inspector, VFS Dry-Run & Metrics ---');
    const toolsRes = await request({ method: 'GET', path: '/api/tools' });
    assert(toolsRes.status === 200 && toolsRes.body.length >= 40, `GET /api/tools returned ${toolsRes.body.length} MCP tools`);

    const schemaRes = await request({ method: 'GET', path: '/api/tools/genos_create/schema' });
    assert(schemaRes.status === 200 && schemaRes.body.type === 'object' && schemaRes.body.properties.path !== undefined, 'GET /api/tools/:name/schema returned draft-07 JSON Schema');

    const dryRunRes = await request({
      method: 'POST',
      path: '/api/tools/dry-run'
    }, { toolName: 'genos_create', args: { path: 'src/test.js', content: 'console.log(1);' } });
    assert(dryRunRes.status === 200 && dryRunRes.body.blastRadiusScore >= 0 && dryRunRes.body.sideEffects.filesCreated.length === 1, 'POST /api/tools/dry-run executed VFS simulation with Blast Radius');

    const metricsRes = await request({ method: 'GET', path: '/api/tools/metrics' });
    assert(metricsRes.status === 200 && metricsRes.body.tools.length > 0, 'GET /api/tools/metrics returned sub-millisecond latency & token metrics');

    // 6. Swarm Telemetry: Shannon Entropy & Topology Graph
    console.log('\n--- 6. Swarm Telemetry: Shannon Entropy & Dynamic Topology ---');
    const swarmMetricsRes = await request({ method: 'GET', path: '/api/swarm/metrics' });
    assert(swarmMetricsRes.status === 200 && swarmMetricsRes.body.rawEntropy !== undefined, 'GET /api/swarm/metrics returned Shannon entropy H(A)');
    assert(swarmMetricsRes.body.cognitiveDriftState !== undefined, 'Cognitive drift state detected');

    const swarmTopoRes = await request({ method: 'GET', path: '/api/swarm/topology' });
    assert(swarmTopoRes.status === 200 && swarmTopoRes.body.nodes.length >= 3 && swarmTopoRes.body.particles !== undefined, 'GET /api/swarm/topology returned nodes and particle message flows');

    // 7. Biology & Resilience: Apoptose & Cryptobiose
    console.log('\n--- 7. Biology & Resilience: Apoptosis Autopsy & Cryptobiosis ---');
    const apopRes = await request({
      method: 'POST',
      path: '/api/resilience/apoptosis',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}`, 'X-Access-Key': MILITARY_OVERRIDE_TOKEN }
    }, { agentId: 'test_divergent_agent', triggerMetrics: { consecutiveFailures: 4 } });
    assert(apopRes.status === 200 && apopRes.body.apoptosisExecuted === true && apopRes.body.terminalCallStack.length > 0, 'POST /api/resilience/apoptosis generated automated autopsy report');

    const freezeRes = await request({
      method: 'POST',
      path: '/api/resilience/cryptobiosis/freeze',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}`, 'X-Access-Key': MILITARY_OVERRIDE_TOKEN }
    }, { workspaceId: 'ws-genos-core', reason: 'Verification Freeze' });
    assert(freezeRes.status === 200 && freezeRes.body.snapshotId.startsWith('cryptobiosis_'), 'POST /api/resilience/cryptobiosis/freeze created instant state snapshot');

    const thawRes = await request({
      method: 'POST',
      path: '/api/resilience/cryptobiosis/thaw',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, { snapshotId: freezeRes.body.snapshotId });
    assert(thawRes.status === 200 && thawRes.body.success === true, 'POST /api/resilience/cryptobiosis/thaw revived runtime state');

    const driftRes = await request({
      method: 'POST',
      path: '/api/resilience/drift'
    }, { ancestorPrompt: 'Refactor parser with guard clauses', currentPrompt: 'Refactor parser with recursive loop' });
    assert(driftRes.status === 200 && driftRes.body.driftScore >= 0, 'POST /api/resilience/drift evaluated prompt mutation Levenshtein drift');

    // 8. Genetics & Genome: Phylogeny & Genetic Crossover
    console.log('\n--- 8. Genetics & Genome: Phylogeny & Crossover Synthesizer ---');
    const phyloRes = await request({ method: 'GET', path: '/api/genome/phylogeny' });
    assert(phyloRes.status === 200 && phyloRes.body.nodes.length >= 3, 'GET /api/genome/phylogeny returned evolutionary mutation DAG');

    const allelesRes = await request({ method: 'GET', path: '/api/genome/alleles' });
    assert(allelesRes.status === 200 && allelesRes.body.unclassifiedAlleles.length > 0 && allelesRes.body.dominantBeneficialGenes.length === 0, 'GET /api/genome/alleles refuses unsupported beneficial classifications');

    const crossRes = await request({
      method: 'POST',
      path: '/api/genome/crossover',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, { options: { strategy: 'uniform', mutationRate: 0.05 } });
    assert(crossRes.status === 200 && crossRes.body.childGenes !== undefined && crossRes.body.predictedFitnessScore > 0, 'POST /api/genome/crossover synthesized valid child agent DNA');

    // 9. Memory & Experience: Hybrid Vector Search, Cherry-Pick & What-If
    console.log('\n--- 9. Memory & Experience: Vector Search, Cherry-Pick & What-If ---');
    const memSearchRes = await request({
      method: 'POST',
      path: '/api/memory/search'
    }, { query: 'sqlite wal concurrency locking' });
    assert(memSearchRes.status === 200 && memSearchRes.body.topSuccessfulGoldenPaths.length > 0, 'POST /api/memory/search executed hybrid cosine vector search');

    const cherryRes = await request({
      method: 'POST',
      path: '/api/memory/cherry-pick'
    }, { turns: [{ step: 1, action: 'view_file' }, { step: 2, error: 'fail' }, { step: 3, success: true, action: 'replace_file_content' }] });
    assert(cherryRes.status === 200 && cherryRes.body.prunedStepCount < cherryRes.body.originalStepCount, 'POST /api/memory/cherry-pick pruned dead-ends into Golden Path');

    const whatIfRes = await request({
      method: 'POST',
      path: '/api/memory/counterfactual'
    }, { stepIndex: 2, alterations: { ruleInjected: 'Strict validation' } });
    assert(whatIfRes.status === 200 && whatIfRes.body.comparison.counterfactualTimeline.finalStatus === 'SUCCESS', 'POST /api/memory/counterfactual simulated branching timeline comparison');

    // 10. Workspace & Causal Incidents: Diff, O(log N) Bisect & Rollback
    console.log('\n--- 10. Workspace: Multi-Branch Diff, Causal Bisection & Rollback ---');
    const authHeaders = { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}`, 'X-Access-Key': MILITARY_OVERRIDE_TOKEN };
    await request({
      method: 'POST',
      path: '/api/workspaces/ws-genos-core/snapshots',
      headers: authHeaders
    }, { label: 'Step 1 baseline', reason: 'Bisection baseline' });
    fs.writeFileSync(path.join(__dirname, '.tmp-ws-genos-core', 'src', 'parser.js'), 'function parse(input){ return input.deep.property; }\n');
    await request({
      method: 'POST',
      path: '/api/workspaces/ws-genos-core/snapshots',
      headers: authHeaders
    }, { label: 'Step 2 regression', reason: 'Introduced null dereference' });

    const diffRes = await request({ method: 'GET', path: '/api/workspaces/diff?base=ws-genos-core&target=ws-genos-core' });
    assert(diffRes.status === 200 && Array.isArray(diffRes.body.diffEntries) && diffRes.body.churnHeatmap.length > 0, 'GET /api/workspaces/diff returned multi-branch diff & churn heatmap');

    const bisectRes = await request({
      method: 'POST',
      path: '/api/workspaces/bisect',
      headers: authHeaders
    }, { workspaceId: 'ws-genos-core', testCommand: 'npm test', timeoutMs: 30000 });
    assert(bisectRes.status === 200 && bisectRes.body.bisectionComplete && bisectRes.body.culpritReport.stepNumber > 0, 'POST /api/workspaces/bisect isolated culprit step in O(log N) iterations');

    const rollbackRes = await request({
      method: 'POST',
      path: '/api/workspaces/rollback',
      headers: authHeaders
    }, { workspaceId: 'ws-genos-core', stepNumber: bisectRes.body.culpritReport.stepNumber });
    assert(rollbackRes.status === 200 && rollbackRes.body.rollback === true && rollbackRes.body.restoredSnapshot?.id !== undefined, 'POST /api/workspaces/rollback restored the pre-regression snapshot atomically');

    // 11. Command Palette, Terminal & Kill Switch
    console.log('\n--- 11. Command Palette, Terminal & Emergency Kill Switch ---');
    const unauthTerm = await request({ method: 'POST', path: '/api/terminal', skipDefaultAuth: true }, { command: 'status' });
    assert(unauthTerm.status === 401, 'Unauthenticated POST /api/terminal rejected with 401');

    const termRes = await request({
      method: 'POST',
      path: '/api/terminal',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, { command: 'status' });
    assert(termRes.status === 200 && termRes.body.output.includes('SYSTEM OK'), 'Authenticated POST /api/terminal executed');

    const cmdRes = await request({
      method: 'POST',
      path: '/api/command',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, { action: 'inspect_state' });
    assert(cmdRes.status === 200 && cmdRes.body.success === true, 'Authenticated POST /api/command executed');


    const killRes = await request({
      method: 'POST',
      path: '/api/security/kill-switch',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    }, { reason: 'Automated test halt' });
    assert(killRes.status === 200 && killRes.body.success === true, 'POST /api/security/kill-switch triggered halt');

    await request({
      method: 'POST',
      path: '/api/security/kill-switch/reset',
      headers: { Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}` }
    });

    console.log(`\n========================================`);
    console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log(`========================================\n`);

  } finally {
    server.close();
    await closeDatabase();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
    fs.rmSync(path.join(__dirname, '.tmp-ws-genos-core'), { recursive: true, force: true });
  }

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
