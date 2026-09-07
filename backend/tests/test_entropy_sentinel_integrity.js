/**
 * Test Suite: Entropy Sentinel Comprehensive Integrity
 * Validates:
 * 1. Non-collapse on diverse CLI commands (no false-positive collapse)
 * 2. 1-step collapse detection (A -> A -> A)
 * 3. 2-step cyclic loop detection (A -> B -> A -> B) via transition entropy & cycle detector
 * 4. 3-step cyclic loop detection (A -> B -> C -> A -> B -> C)
 * 5. Dominance ratio collapse with parasite action (93% dominance)
 * 6. High entropy confusion spike (>= 10 actions) vs early exploratory tolerance (< 10 actions)
 * 7. Peer-to-peer deadlock detection with telemetry messages filtered out
 * 8. MCP tool genos_get_swarm_entropy and fundamentals.entropyCheck integration
 */

const assert = require('assert');
const swarmMetrics = require('../src/services/swarmMetricsService');
const swarmSentinel = require('../src/services/swarmSentinelService');
const mcpRegistry = require('../src/services/mcpToolRegistry');
const fundamentals = require('../src/services/primitiveHandlers/fundamentals');

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
  console.log('       ENTROPY SENTINEL & CYCLIC DEADLOCK INTEGRITY SUITE      ');
  console.log('===============================================================');

  // Test 1: Diverse CLI commands must not trigger collapse
  console.log('\n--- 1. Diverse CLI Commands (Prevent False-Positive Collapse) ---');
  const cliAgent = 'agent-cli-healthy-' + Date.now();
  const cliCommands = [
    { type: 'EXECUTE', action: 'command_execution', payload: { command: 'git status' } },
    { type: 'EXECUTE', action: 'command_execution', payload: { command: 'cargo check --lib' } },
    { type: 'EXECUTE', action: 'command_execution', payload: { command: 'npm test' } },
    { type: 'EXECUTE', action: 'command_execution', payload: { command: 'python manage.py run' } },
    { type: 'EXECUTE', action: 'command_execution', payload: { command: 'cat package.json' } },
    { type: 'EXECUTE', action: 'command_execution', payload: { command: 'git diff' } }
  ];

  let lastCliInspection = null;
  for (const cmd of cliCommands) {
    lastCliInspection = swarmSentinel.inspectEvent(cliAgent, cmd);
  }

  const cliEntropy = swarmSentinel.getAgentEntropy(cliAgent);
  check(lastCliInspection.intervention === false, 'Agent executing diverse CLI commands does not trigger intervention');
  check(lastCliInspection.action === 'NONE', 'Sentinel action is NONE for healthy CLI stream');
  check(cliEntropy.cognitiveDriftState === 'OPTIMAL_EXPLORATION', 'CLI drift state is OPTIMAL_EXPLORATION');
  check(cliEntropy.uniqueActionCount >= 5, `Unique actions extracted properly (${cliEntropy.uniqueActionCount} >= 5)`);

  // Test 2: 1-step collapse (A -> A -> A)
  console.log('\n--- 2. 1-step Collapse Detection (A -> A -> A) ---');
  const stuckAgent = 'agent-stuck-loop-' + Date.now();
  let stuckInspection = null;
  for (let i = 0; i < 6; i++) {
    stuckInspection = swarmSentinel.inspectEvent(stuckAgent, {
      type: 'EXECUTE',
      action: 'command_execution',
      payload: { command: 'git status' }
    });
  }

  const stuckEntropy = swarmSentinel.getAgentEntropy(stuckAgent);
  check(stuckInspection.intervention === true, 'Repeated single action triggers intervention = true');
  check(stuckInspection.state === 'COLLAPSE_DEADLOCK', 'State identified as COLLAPSE_DEADLOCK');
  check(stuckEntropy.rawEntropy === 0, 'Raw entropy is 0 for identical actions');
  check(stuckEntropy.dominanceRatio === 1, 'Dominance ratio is 1.0');

  // Test 3: 2-step periodic cycle (A -> B -> A -> B)
  console.log('\n--- 3. 2-step Cyclic Loop Detection (A -> B -> A -> B) ---');
  const cycle2 = ['cmd:cargo:build', 'cmd:cargo:test', 'cmd:cargo:build', 'cmd:cargo:test', 'cmd:cargo:build', 'cmd:cargo:test'];
  const metrics2 = swarmMetrics.calculateShannonEntropy(cycle2);

  check(metrics2.isPeriodicCycle === true, 'calculateShannonEntropy detects period 2');
  check(metrics2.cycleLength === 2, `cycleLength is 2 (got ${metrics2.cycleLength})`);
  check(metrics2.transitionEntropy === 0, `Transition entropy is 0 for deterministic period 2 (got ${metrics2.transitionEntropy})`);
  check(metrics2.cognitiveDriftState === 'COLLAPSE_DEADLOCK', 'Period 2 cycle triggers COLLAPSE_DEADLOCK');

  // Test 4: 3-step periodic cycle (A -> B -> C -> A -> B -> C)
  console.log('\n--- 4. 3-step Cyclic Loop Detection (A -> B -> C) ---');
  const cycle3 = ['read_file', 'edit_file', 'run_tests', 'read_file', 'edit_file', 'run_tests', 'read_file', 'edit_file', 'run_tests'];
  const metrics3 = swarmMetrics.calculateShannonEntropy(cycle3);

  check(metrics3.isPeriodicCycle === true, 'calculateShannonEntropy detects period 3');
  check(metrics3.cycleLength === 3, `cycleLength is 3 (got ${metrics3.cycleLength})`);
  check(metrics3.transitionEntropy === 0, `Transition entropy is 0 for deterministic period 3 (got ${metrics3.transitionEntropy})`);
  check(metrics3.cognitiveDriftState === 'COLLAPSE_DEADLOCK', 'Period 3 cycle triggers COLLAPSE_DEADLOCK');

  // Test 5: Dominance ratio collapse with parasite action (93% dominance)
  console.log('\n--- 5. Dominance Ratio Collapse (14 x A + 1 x B) ---');
  const dominatedActions = new Array(14).fill('tool:bash').concat(['tool:grep']);
  const dominatedMetrics = swarmMetrics.calculateShannonEntropy(dominatedActions);

  check(dominatedMetrics.dominanceRatio >= 0.85, `Dominance ratio is >= 0.85 (got ${dominatedMetrics.dominanceRatio})`);
  check(dominatedMetrics.cognitiveDriftState === 'COLLAPSE_DEADLOCK', 'Drift state is COLLAPSE_DEADLOCK despite parasite action');

  // Test 6: Confusion spike vs early exploration
  console.log('\n--- 6. Confusion Spike (>= 10 actions) vs Early Exploration ---');
  const earlyDistinct = ['action1', 'action2', 'action3'];
  const earlyMetrics = swarmMetrics.calculateShannonEntropy(earlyDistinct);
  check(earlyMetrics.cognitiveDriftState === 'OPTIMAL_EXPLORATION', '3 distinct actions considered OPTIMAL_EXPLORATION, not spike confusion');

  const chaoticDistinct = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12'];
  const chaoticMetrics = swarmMetrics.calculateShannonEntropy(chaoticDistinct);
  check(chaoticMetrics.cognitiveDriftState === 'SPIKE_CONFUSION', '12 distinct erratic actions trigger SPIKE_CONFUSION');

  // Test 7: Deadlock detection with telemetry filtered out
  console.log('\n--- 7. Deadlock Detection & Telemetry Filtering ---');
  const telemetryAgent = 'agent-telemetry-' + Date.now();
  let teleResult = null;
  for (let i = 0; i < 20; i++) {
    teleResult = swarmSentinel.recordInteraction(telemetryAgent, 'telemetry', false);
    swarmSentinel.recordInteraction(telemetryAgent, 'system', false);
  }
  check(teleResult === null, 'Telemetry messages are filtered out and return null');

  const peerA = 'agent-peer-a-' + Date.now();
  const peerB = 'agent-peer-b-' + Date.now();
  let peerResult = null;
  for (let i = 0; i < 15; i++) {
    swarmSentinel.recordInteraction(peerA, peerB, false);
    peerResult = swarmSentinel.recordInteraction(peerB, peerA, false);
  }
  check(peerResult && peerResult.deadlockDetected === true, 'High-volume peer ping-pong without state change triggers deadlockDetected');
  check(peerResult.action === 'BREAK_DEADLOCK', 'Deadlock intervention action is BREAK_DEADLOCK');

  // Test 8: MCP Tool & Fundamentals Entropy Primitive Integration
  console.log('\n--- 8. MCP Tool & Fundamentals Integration ---');
  const mcpRes = await mcpRegistry.dispatchTool('genos_get_swarm_entropy', { agent_id: cliAgent });
  check(mcpRes.kind === 'bio', 'Tool dispatched to bio execution handler');
  check(mcpRes.result.success === true, 'MCP genos_get_swarm_entropy execution successful');
  check(mcpRes.result.swarmEntropy !== undefined, 'Swarm entropy payload returned');
  check(mcpRes.result.agentEntropy !== null, 'Agent entropy payload returned for cliAgent');
  check(mcpRes.result.agentEntropy.uniqueActionCount >= 5, 'Agent entropy contains accurate unique action count');

  const primRes = fundamentals.entropyCheck({ actionHistory: cycle2 });
  check(primRes.success === true, 'fundamentals.entropyCheck executes successfully');
  check(primRes.isPeriodicCycle === true, 'fundamentals.entropyCheck detects periodic cycle');
  check(primRes.cognitiveDriftState === 'COLLAPSE_DEADLOCK', 'fundamentals.entropyCheck returns COLLAPSE_DEADLOCK');

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
