const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const { ensureAgentStrategyContracts } = require('./src/db/seed');
const { TEST_ADMIN_TOKEN } = require('./testAuth');
const { buildStrategyContract } = require('./src/services/strategyContractService');
const { encodeMission, decodeMission } = require('./src/services/runtimeProtocol');
const { listStrategies } = require('./src/strategies/strategyRegistry');
const { selectStrategyPortfolio } = require('./src/strategies/strategySelector');
const strategyExecution = require('./src/services/strategyExecutionService');

const PORT = 4103;

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, method, path: route,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'strategy-contract-test',
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const dbPath = path.resolve(__dirname, 'strategy-contract-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);

  const incident = buildStrategyContract({ problem: 'Reproduce an intermittent production incident' });
  assert.equal(listStrategies().length, 77);
  assert.equal(incident.problem_profile.type, 'incident');
  assert.equal(incident.selected_strategy.primary, 'mutated_incident_universes');
  assert.equal(incident.promotion.require_human_approval, true);
  assert.equal(incident.strategy_decisions.length, 77);
  assert.equal(incident.strategy_decision_summary.total_registry, 77);
  assert(incident.strategy_portfolio.length >= 6);
  assert(incident.strategy_decisions.some((decision) => decision.id === 'mcts_prm' && decision.status === 'ineligible'));
  const research = selectStrategyPortfolio({ problem: 'Run a scientific hypothesis experiment' });
  assert.equal(research.primary.id, 'factorial_experiment');
  assert.equal(research.decisions.length, 77);
  const framedMission = encodeMission({
    agentId: 'agent-strategy-test',
    strategyContractJson: JSON.stringify(incident)
  });
  const decodedMission = decodeMission(framedMission);
  assert.equal(JSON.parse(decodedMission.strategyContractJson).selected_strategy.primary, 'mutated_incident_universes');

  const server = createApp().listen(PORT);
  try {
    const registry = await request('GET', '/api/strategies');
    assert.equal(registry.status, 200);
    assert.equal(registry.body.total, 77);
    assert.equal(registry.body.registryTotal, 77);

    const preview = await request('POST', '/api/strategies/select', { problem: 'Choose an architecture trade-off' });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.selected_strategy.primary, 'causal_replay_intervention');
    assert.equal(preview.body.strategy_decisions.length, 77);

    await db.run(`INSERT INTO agents (id, name, role, status, current_task)
      VALUES ('agent-strategy-test', 'Strategy Test', 'Project Orchestrator', 'idle', 'Diagnose an unknown cause bug with tests')`);

    const first = await request('POST', '/api/agents/agent-strategy-test/strategy-contracts', {
      problem: 'Diagnose an unknown cause bug with deterministic tests'
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.version, 1);
    assert.equal(first.body.primaryStrategy, 'falsification_forks');
    assert.match(first.body.contractHash, /^sha256:[a-f0-9]{64}$/);

    const second = await request('POST', '/api/agents/agent-strategy-test/strategy-contracts', {
      problem: 'Review a critical security vulnerability before deployment'
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.version, 2);
    assert.equal(second.body.primaryStrategy, 'red_blue_coevolution');

    const latest = await request('GET', '/api/agents/agent-strategy-test/strategy-contract');
    assert.equal(latest.status, 200);
    assert.equal(latest.body.id, second.body.id);
    assert.equal(latest.body.contract.promotion.merge_workspace_automatically, false);

    const history = await request('GET', '/api/agents/agent-strategy-test/strategy-contracts');
    assert.equal(history.status, 200);
    assert.equal(history.body.length, 2);
    assert.equal(history.body[0].status, 'active');
    assert.equal(history.body[1].status, 'superseded');

    const executionRun = await strategyExecution.createExecutionRun(db, {
      agentId: 'agent-strategy-test',
      budget: { tokens: 1000, costUsd: 1, latencyMs: 60000, events: 20 }
    });
    assert.equal(executionRun.steps.length, 8);
    assert.equal(executionRun.status, 'planned');
    await strategyExecution.recordExecutionEvent(db, 'agent-strategy-test', {
      eventType: 'AGENT_RUNTIME_STARTED', action: 'START', detail: 'Runtime started', payload: {}
    });
    await strategyExecution.recordExecutionEvent(db, 'agent-strategy-test', {
      eventType: 'AGENT_PLAN_CREATED', action: 'PLAN', detail: 'Plan created', payload: {}
    });
    await strategyExecution.recordExecutionEvent(db, 'agent-strategy-test', {
      eventType: 'AGENT_STEP', action: 'EXECUTE', detail: 'Implementation', payload: { usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 50 } }
    });
    await strategyExecution.recordExecutionEvent(db, 'agent-strategy-test', {
      eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Done', payload: {}
    });
    const executionLatest = await request('GET', '/api/agents/agent-strategy-test/execution-runs/latest');
    assert.equal(executionLatest.status, 200);
    assert.equal(executionLatest.body.status, 'awaiting_approval');
    assert.equal(executionLatest.body.metrics.tokens, 150);
    assert.equal(executionLatest.body.metrics.cachedInputTokens, 60);
    assert.equal(executionLatest.body.metrics.billableTokens, 90);
    assert(executionLatest.body.adherence.deviations.some((item) => item.status === 'skipped'));
    const approved = await request('POST', `/api/execution-runs/${executionRun.id}/approve`);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, 'completed');

    const blockedRun = await strategyExecution.createExecutionRun(db, {
      agentId: 'agent-strategy-test', budget: { tokens: 10, costUsd: 1, latencyMs: 60000, events: 20 }
    });
    const blocked = await strategyExecution.recordExecutionEvent(db, 'agent-strategy-test', {
      eventType: 'AGENT_STEP', action: 'EXECUTE', detail: 'Too expensive', payload: { tokens: 11 }
    });
    assert.equal(blocked.halt, true);
    assert.equal(blocked.run.status, 'blocked');
    assert.match(blocked.run.guardrailReason, /tokens budget exceeded/);
    assert.equal((await strategyExecution.getRun(db, blockedRun.id)).status, 'blocked');

    await db.run(`INSERT INTO agents (id, name, role, status, current_task)
      VALUES ('agent-legacy-contract', 'Legacy Contract', 'Project Orchestrator', 'idle', 'Choose an architecture trade-off')`);
    const legacy = await request('POST', '/api/agents/agent-legacy-contract/strategy-contracts', {
      problem: 'Choose an architecture trade-off'
    });
    const legacySnapshot = { ...legacy.body.contract };
    delete legacySnapshot.strategy_decision_summary;
    delete legacySnapshot.strategy_decisions;
    await db.run('UPDATE strategy_contracts SET contract_json = ? WHERE id = ?', JSON.stringify(legacySnapshot), legacy.body.id);
    await ensureAgentStrategyContracts(db);
    const upgraded = await request('GET', '/api/agents/agent-legacy-contract/strategy-contract');
    assert.equal(upgraded.status, 200);
    assert.equal(upgraded.body.version, 2);
    assert.equal(upgraded.body.createdBy, 'strategy_registry_upgrade');
    assert.equal(upgraded.body.contract.strategy_decisions.length, 77);

    const invalid = await request('POST', '/api/agents/agent-strategy-test/strategy-contracts', {
      contract: { schema: 'invalid' }
    });
    assert.equal(invalid.status, 400);
    console.log('Strategy contract API: all assertions passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
