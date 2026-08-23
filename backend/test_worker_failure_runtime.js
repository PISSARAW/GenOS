const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decodeEvents } = require('./src/services/runtimeProtocol');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-failure-runtime-'));
const fakeCodex = path.join(directory, 'fake-codex');
fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const report = JSON.parse(process.env.FAKE_WORKER_REPORT);
process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(report) } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
`, { mode: 0o700 });

function execute(report) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, 'bin/genos-agent-runtime.cjs')], {
    cwd: directory,
    input: JSON.stringify({
      agentId: 'worker-runtime-test', executionMode: 'worker', orchestratorAgentId: 'orchestrator-runtime-test',
      name: 'Verify · runtime failure protocol', role: 'independent_reviewer', prompt: 'Find a verified answer',
      strategyContractJson: '{}', executionPolicyJson: '{}', toolLeaseJson: '[]', genosCapsuleJson: '{}'
    }),
    env: {
      ...process.env,
      CODEX_EXECUTABLE: fakeCodex,
      FAKE_WORKER_REPORT: JSON.stringify(report),
      GENOS_BIN: path.join(directory, 'missing-genos'),
      GENOS_MCP_BIN: path.join(directory, 'missing-genos-mcp'),
      GENOS_WORKSPACE_ROOT: directory
    },
    timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr.toString());
  const events = [];
  const remainder = decodeEvents(result.stdout, (event) => events.push(event));
  assert.equal(remainder.length, 0);
  return events;
}

try {
  const failed = execute({
    outcome: 'failed', claims: [], uncertainties: ['root cause remains unknown'], tests: [],
    failure: { category: 'unresolved_task', reason: 'No verified result', evidence: ['two approaches failed'] }
  });
  assert(failed.some((event) => event.eventType === 'WORKER_TASK_FAILED'));
  assert(!failed.some((event) => event.eventType === 'AGENT_COMPLETED'));

  const noAnswer = execute({
    outcome: 'no_answer', claims: [], uncertainties: [], tests: [],
    noAnswerProof: { method: 'finite enumeration', evidence: ['all 16 states rejected'] }
  });
  assert(noAnswer.some((event) => event.eventType === 'WORKER_NO_ANSWER_PROVEN'));
  assert(!noAnswer.some((event) => event.eventType === 'WORKER_TASK_FAILED'));
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Worker failure runtime protocol checks passed.');
