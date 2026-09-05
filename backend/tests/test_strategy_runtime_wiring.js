const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { getDatabase, closeDatabase } = require('../src/db');
const adapter = require('../src/services/strategyExecutionAdapter');
const strategyService = require('../src/services/strategyExecutionService');
const mcpStrategy = require('../src/services/mcpStrategyTools');
const mcpExecutor = require('../src/services/mcpExecutor');
const strategyContracts = require('../src/services/strategyContractService');

async function runTests() {
  console.log('=== TEST 1: Direct executePrimitive and executePipelineWithFeedback ===');
  const primRes = await adapter.executePrimitive('mcts_select', { candidates: ['node-1', 'node-2'] });
  assert(primRes !== undefined, 'executePrimitive must return a result');
  console.log('  ✅ executePrimitive(mcts_select):', primRes.success);

  const pipelineRes = await adapter.executePipelineWithFeedback(['snapshot', 'fork'], {
    agentId: 'test-agent',
    orchestratorId: 'test-agent'
  });
  assert.equal(pipelineRes.success, true, 'pipeline must succeed');
  assert.equal(pipelineRes.results.length, 2, 'two primitives executed');
  console.log('  ✅ executePipelineWithFeedback:', pipelineRes.success, pipelineRes.results.map((r) => r.primitive));

  console.log('\n=== TEST 2: MCP Strategy Tools Routing ===');
  assert.equal(mcpStrategy.isStrategyTool('genos_strat_mcts_select'), true);
  assert.equal(mcpStrategy.isStrategyTool('genos_execute_primitive'), true);
  assert.equal(mcpStrategy.isStrategyTool('genos_execute_strategy_pipeline'), true);
  assert.equal(mcpStrategy.isStrategyTool('genos_unrelated_tool'), false);

  const mcpStratRes = await mcpStrategy.executeStrategyTool('genos_strat_mcts_select', { candidates: ['alpha', 'beta'] });
  assert.equal(mcpStratRes.configured, true);
  assert.equal(mcpStratRes.transport, 'strategy_primitive');
  console.log('  ✅ MCP genos_strat_mcts_select routed:', mcpStratRes.status);

  const mcpExecPrim = await mcpStrategy.executeStrategyTool('genos_execute_primitive', {
    primitive: 'entropy_check',
    context: {}
  });
  assert.equal(mcpExecPrim.configured, true);
  assert.equal(mcpExecPrim.output.success, true);
  console.log('  ✅ MCP genos_execute_primitive(entropy_check) routed:', mcpExecPrim.status);

  const mcpExecPipeline = await mcpStrategy.executeStrategyTool('genos_execute_strategy_pipeline', {
    primitives: ['snapshot', 'slm_route'],
    context: { agentId: 'test-agent' }
  });
  assert.equal(mcpExecPipeline.configured, true);
  assert.equal(mcpExecPipeline.output.results.length, 2);
  console.log('  ✅ MCP genos_execute_strategy_pipeline routed:', mcpExecPipeline.status);

  const mcpDirect = await mcpExecutor.executeConfiguredTransport({
    toolName: 'genos_strat_compile_memory',
    args: { agentId: 'test-agent', facts: ['Fact A'] }
  });
  assert.equal(mcpDirect.configured, true);
  assert.equal(mcpDirect.transport, 'strategy_primitive');
  console.log('  ✅ mcpExecutor.executeConfiguredTransport(genos_strat_compile_memory):', mcpDirect.status);

  console.log('\n=== TEST 3: strategyExecutionService Step Primitives & recordExecutionEvent ===');
  const dbPath = path.resolve(__dirname, 'strategy-wiring-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);

  try {
    await db.run("DELETE FROM strategy_execution_steps WHERE run_id IN (SELECT id FROM strategy_execution_runs WHERE agent_id = 'wiring-agent')");
    await db.run("DELETE FROM strategy_execution_runs WHERE agent_id = 'wiring-agent'");
    await db.run("DELETE FROM strategy_contracts WHERE agent_id = 'wiring-agent'");
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('wiring-agent', 'Wiring Agent', 'orchestrator', 'running', 'orchestrator')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'wiring-agent',
      problem: 'Diagnose an incident with memory and bisection'
    });
    const run = await strategyService.createExecutionRun(db, {
      agentId: 'wiring-agent',
      contractRecord,
      budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
    });
    assert.equal(run.steps.length, 8);

    // Step 0: memory_retrieval
    const step0 = run.steps[0];
    const execStepRes = await strategyService.executeStepPrimitives(db, 'wiring-agent', {
      step: step0,
      context: { task: 'Investigate incident' }
    });
    assert(execStepRes.results.length > 0, 'step 0 primitives should execute');
    console.log('  ✅ executeStepPrimitives step 0 (memory_retrieval):', execStepRes.results.map((r) => r.primitive));

    // Record runtime started event
    const eventRes = await strategyService.recordExecutionEvent(db, 'wiring-agent', {
      eventType: 'AGENT_RUNTIME_STARTED',
      action: 'START',
      detail: 'Runtime initiated',
      payload: {}
    });
    assert.equal(eventRes.halt, false);
    const updatedRun = await strategyService.getRun(db, run.id);
    const step0Updated = updatedRun.steps[0];
    assert(step0Updated.evidence.length > 0, 'evidence must be recorded for step 0');
    console.log('  ✅ recordExecutionEvent auto-executed step primitives and recorded evidence');

    // Test Feedback Loop when a primitive fails
    console.log('\n=== TEST 4: Feedback loop adaptation on primitive failure ===');
    const failingPipelineRes = await adapter.executePipelineWithFeedback(['quarantine'], {
      agentId: 'non-existent-agent-xyz'
    });
    assert.equal(failingPipelineRes.success, false, 'quarantine of non-existent agent should fail');
    assert(failingPipelineRes.results.some((r) => r.primitive === 'adaptation_feedback' || !r.result.success));
    console.log('  ✅ Feedback loop triggered adaptively on failure');

  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }

  console.log('\n========================================');
  console.log('ALL STRATEGY RUNTIME WIRING TESTS PASSED');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
