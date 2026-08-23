const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decodeEvents } = require('./src/services/runtimeProtocol');

function eventsFrom(buffer) {
  const events = [];
  const remaining = decodeEvents(Buffer.from(buffer), (event) => events.push(event));
  assert.equal(remaining.length, 0);
  return events;
}

function runRuntime(directory, fakeCodex, mission, extraEnv = {}) {
  return spawnSync(process.execPath, [path.resolve(__dirname, 'bin/genos-agent-runtime.cjs')], {
    cwd: directory,
    input: JSON.stringify({
      agentId: 'root-test', executionMode: 'orchestrator', prompt: 'Synthesize.',
      strategyContractJson: '{}', executionPolicyJson: '{}', toolLeaseJson: '[]',
      genosCapsuleJson: '{}', executionBudgetJson: JSON.stringify({ tokens: 1_000_000, events: 100, latencyMs: 5000, costUsd: 5 }),
      autonomyPlanJson: '{}',
      ...mission
    }),
    env: {
      ...process.env, ...extraEnv, CODEX_EXECUTABLE: fakeCodex,
      GENOS_BIN: path.join(directory, 'missing-genos'),
      GENOS_MCP_BIN: path.join(directory, 'missing-mcp'),
      GENOS_WORKSPACE_ROOT: directory
    },
    timeout: 10000
  });
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-runtime-budget-'));
try {
  const fakeCodex = path.join(directory, 'fake-codex');
  fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
let input=''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => {
  if (process.env.RUNTIME_CASE === 'budget') {
    for (let i=0; i<10; i++) process.stdout.write(JSON.stringify({type:'item.started',item:{type:'command',command:'step-'+i}})+'\\n');
    setTimeout(() => {}, 1000);
    return;
  }
  const influence = process.env.RUNTIME_CASE === 'valid'
    ? [{workerId:'worker-a',usedClaims:['claim-a'],influence:'Constrained the conclusion.'}]
    : [];
  const report = {outcome:'success',claims:[{statement:'done',evidence:['worker evidence']}],uncertainties:[],tests:[],dossierInfluence:influence};
  process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(report)}})+'\\n');
  process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n');
});
`, { mode: 0o700 });

  const budget = runRuntime(directory, fakeCodex, {
    executionBudgetJson: JSON.stringify({ tokens: 1_000_000, events: 2, latencyMs: 5000, costUsd: 5 })
  }, { RUNTIME_CASE: 'budget' });
  assert.equal(budget.status, 1);
  const budgetEvents = eventsFrom(budget.stdout);
  assert(budgetEvents.some((event) => event.eventType === 'BUDGET_EXHAUSTED'));
  assert(budgetEvents.some((event) => event.eventType === 'AGENT_HALTED' && event.status === 'blocked'));

  const synthesisMission = {
    autonomyPlanJson: JSON.stringify({ schema: 'test', synthesisOnly: true, completedWorkerIds: ['worker-a'] })
  };
  const valid = runRuntime(directory, fakeCodex, synthesisMission, { RUNTIME_CASE: 'valid' });
  assert.equal(valid.status, 0, valid.stderr.toString());
  assert(eventsFrom(valid.stdout).some((event) => event.eventType === 'DOSSIER_INFLUENCE_VERIFIED'));

  const invalid = runRuntime(directory, fakeCodex, synthesisMission, { RUNTIME_CASE: 'missing' });
  assert.equal(invalid.status, 1);
  assert(eventsFrom(invalid.stdout).some((event) => event.eventType === 'HARD_INVARIANT_FAILURE' && event.action === 'DOSSIER_INFLUENCE'));

  console.log('Runtime budget and dossier-influence checks passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
