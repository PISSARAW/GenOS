'use strict';

const assert = require('assert');
const originalLog = console.log;
const originalInfo = console.info;
const { completionEvidencePayload } = require('../bin/local-codex-runtime.cjs');
console.log = originalLog;
console.info = originalInfo;
const { hasDecisionEvidence } = require('../src/services/agentEvidenceService');

const report = {
  outcome: 'success',
  claims: [{ statement: 'Verifier passed.', evidence: ['genos://code-test/verified-receipt'] }]
};
const payload = completionEvidencePayload({ observedRoute: { provider: 'ollama' } }, report);

assert.strictEqual(payload.provider, 'ollama');
assert.deepStrictEqual(payload.evidenceReport, report);
assert.strictEqual(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload }), true);
assert.strictEqual(hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload: { provider: 'ollama' } }), false);

console.log('Local runtime completion evidence checks passed.');
