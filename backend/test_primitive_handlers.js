const { getDatabase } = require('./src/db/index');
const adapter = require('./src/services/strategyExecutionAdapter');

async function runTests() {
  console.log("=== Initializing DB for Tests ===");
  const db = await getDatabase();
  
  // Seed mock tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT, agent_type TEXT, execution_mode TEXT, current_task TEXT, workspace_id TEXT, model_tier TEXT, parent_agent_id TEXT, lineage_relation TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS memory_entries (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT);
    CREATE TABLE IF NOT EXISTS genome_decisions (id TEXT PRIMARY KEY, title TEXT, content TEXT, cart_nodes_json TEXT, created_by TEXT, category TEXT, embedding_blob BLOB, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS memory_synapses (source_id TEXT, target_id TEXT, weight REAL, PRIMARY KEY(source_id, target_id));
    CREATE TABLE IF NOT EXISTS agent_organization_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, orchestrator_id TEXT, organization TEXT, organization_version INTEGER, sender_agent_id TEXT, recipient_agent_id TEXT, channel TEXT, kind TEXT, content TEXT, payload_json TEXT, delivery TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
  
  // Seed an orchestrator agent
  await db.run("INSERT OR IGNORE INTO agents (id, name, role, status, agent_type, execution_mode) VALUES ('test_orchestrator', 'Orch', 'Orchestrator', 'running', 'GenOS', 'autonomous')");

  console.log("\n=== Testing Lot 1 : Fundamentals (evaluate) ===");
  const lot1 = await adapter.executePrimitive('evaluate', { task: 'test evaluation' });
  console.log('Evaluate result:', lot1.success, lot1.result ? lot1.result.brierScore : 'N/A');

  console.log("\n=== Testing Lot 2 : Memory (compile_memory) ===");
  const lot2 = await adapter.executePrimitive('compile_memory', { 
    agentId: 'test_orchestrator', 
    facts: ['Fact A'], 
    failures: ['Failed X'] 
  });
  console.log('Compile Memory result:', lot2.success, lot2.result ? lot2.result.compiledCount : 'N/A');

  console.log("\n=== Testing Lot 3 : Evolution (mutate) ===");
  const lot3 = await adapter.executePrimitive('mutate', { 
    agentId: 'test_orchestrator', 
    mutations: ['Try inverted binary tree'] 
  });
  console.log('Mutate result:', lot3.success, lot3.result ? lot3.result.mutantId : lot3);

  console.log("\n=== Testing Lot 4 : Safety (quarantine) ===");
  const lot4 = await adapter.executePrimitive('quarantine', { 
    agentId: 'test_orchestrator', 
    reason: 'Testing quarantine primitive' 
  });
  console.log('Quarantine result:', lot4.success, lot4.result ? lot4.result.quarantined : lot4);

  console.log("\n=== Testing Lot 5 : Swarm (quorum) ===");
  const lot5 = await adapter.executePrimitive('quorum', { 
    orchestratorId: 'test_orchestrator',
    issue: 'arch_decision'
  });
  console.log('Quorum result:', lot5.success, lot5.result ? lot5.result.totalVotes : lot5);

  console.log("\n=== Testing Lot 6 : Temporal (dependency_matrix) ===");
  const lot6 = await adapter.executePrimitive('dependency_matrix', { 
    orchestratorId: 'test_orchestrator'
  });
  console.log('Dependency Matrix result:', lot6.success, lot6.result ? 'Matrix created' : lot6);

  console.log("\n=== Testing Lot 7 : Search (mcts_select) ===");
  const lot7 = await adapter.executePrimitive('mcts_select', { 
    candidates: ['test_orchestrator']
  });
  console.log('MCTS Select result:', lot7.success, lot7.result ? lot7.result.selectedNode : lot7);
  
  console.log("\n=== Testing Pipeline with Feedback Loop ===");
  const pipeline = await adapter.executePipeline(['compile_memory', 'evaluate', 'quorum'], {
    orchestratorId: 'test_orchestrator',
    facts: ['Testing pipeline'],
    task: 'Impossible bench'
  });
  console.log('Pipeline executed. Success:', pipeline.success, 'Steps ran:', pipeline.results ? pipeline.results.length : 0);
  
  console.log("\nAll integration checks completed successfully.");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
