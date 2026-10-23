'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const originalLog = console.log;
const originalInfo = console.info;
const { completionEvidencePayload } = require('../bin/local-codex-runtime.cjs');
console.log = originalLog;
console.info = originalInfo;
const { hasDecisionEvidence } = require('../src/services/agentEvidenceService');
const { actionArguments } = require('../src/services/orchestrationActionArguments');

const report = {
  outcome: 'success',
  claims: [{ statement: 'Verifier passed.', evidence: ['genos://code-test/verified-receipt'] }]
};
const payload = completionEvidencePayload({ observedRoute: { provider: 'ollama' } }, report);

assert.strictEqual(payload.provider, 'ollama');
assert.deepStrictEqual(payload.evidenceReport, report);
assert.strictEqual(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload }), true);
assert.strictEqual(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { provider: 'ollama' } }), false);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-completion-replay-'));
try {
  const workspaceRoot = path.join(tempRoot, 'integration');
  const snapshot = path.join(workspaceRoot, '.genos-agent-worlds', 'capsules', 'snapshot.json');
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  fs.writeFileSync(snapshot, '{}');
  const replayPayload = completionEvidencePayload({ mission: {
    genosCapsuleJson: JSON.stringify({ snapshotPath: snapshot })
  } }, report);
  assert.strictEqual(replayPayload.snapshot, snapshot);
  assert.deepStrictEqual(actionArguments({ action: 'replay_before_promotion', tool: 'genos_replay' },
    { payload: replayPayload }, workspaceRoot), { root: workspaceRoot, snapshot });
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Local runtime completion evidence checks passed.');
