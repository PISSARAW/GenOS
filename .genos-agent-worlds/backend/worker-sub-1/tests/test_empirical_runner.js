/**
 * GenOS Empirical Challenge Master Runner
 * Orchestrates stress-test suites across Arena, MCP Sandbox, Swarm, Resilience, Memory, and Workspace.
 */

const { runArenaStressSuite } = require('./test_arena_stress');
const { runMcpStressSuite } = require('./test_mcp_stress');
const { runSwarmResilienceStressSuite } = require('./test_swarm_resilience_stress');
const { runMemoryWorkspaceStressSuite } = require('./test_memory_workspace_stress');

async function runAllEmpiricalChallenges() {
  console.log('======================================================================');
  console.log('  GENOS STUDIO EMPIRICAL CHALLENGER MASTER RUNNER (CHALLENGER 1)      ');
  console.log('======================================================================\n');

  const startTimestamp = Date.now();
  let totalPassed = 0;
  let totalFailed = 0;

  try {
    const arenaRes = runArenaStressSuite();
    totalPassed += arenaRes.passed;
    totalFailed += arenaRes.failed;

    const mcpRes = runMcpStressSuite();
    totalPassed += mcpRes.passed;
    totalFailed += mcpRes.failed;

    const swarmRes = await runSwarmResilienceStressSuite();
    totalPassed += swarmRes.passed;
    totalFailed += swarmRes.failed;

    const memRes = await runMemoryWorkspaceStressSuite();
    totalPassed += memRes.passed;
    totalFailed += memRes.failed;

    const totalDuration = Date.now() - startTimestamp;

    console.log('======================================================================');
    console.log('  EMPIRICAL CHALLENGE EXECUTION SUMMARY                               ');
    console.log('======================================================================');
    console.log(`  Total Modules Stress-Tested: 7 (Arena, MCP, Swarm, Resilience, Memory, Workspace, Genetics)`);
    console.log(`  Total Test Assertions Run:   ${totalPassed + totalFailed}`);
    console.log(`  Total Passed:                ${totalPassed}`);
    console.log(`  Total Failed:                ${totalFailed}`);
    console.log(`  Execution Time:              ${totalDuration}ms`);
    console.log(`  Overall Verdict:             ${totalFailed === 0 ? 'ALL ADVERSARIAL STRESS CHALLENGES PASSED' : 'CHALLENGES FAILED'}`);
    console.log('======================================================================\n');

    if (totalFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal challenge execution error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runAllEmpiricalChallenges();
}

module.exports = { runAllEmpiricalChallenges };
