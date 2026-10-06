'use strict';

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const crypto = require('node:crypto');
const { issueReceipt } = require('../../src/services/epistemicVerifierReceiptService');
const { saveAssembly } = require('../../src/services/aeisAssemblyStore');
const { listVerifierDigests } = require('../../src/services/verifierTrustRegistry');

async function connect(filename) {
  return open({ filename, driver: sqlite3.Database });
}

async function database(filename = ':memory:') {
  const db = await connect(filename);
  await db.exec(`CREATE TABLE workspaces (id TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT, workspace_id TEXT);
    CREATE TABLE strategy_execution_runs (id TEXT, agent_id TEXT, status TEXT);
    INSERT INTO workspaces VALUES ('workspace-a', 'org-a', 'project-a');
    INSERT INTO agents VALUES ('agent-a', 'workspace-a');
    INSERT INTO strategy_execution_runs VALUES ('run-a', 'agent-a', 'awaiting_approval');`);
  return db;
}

async function assembly(db, overrides = {}) {
  const resultId = 'result-a', evidenceDigest = `sha256:${'a'.repeat(64)}`;
  const nonces = overrides.nonces || [crypto.randomUUID(), crypto.randomUUID()];
  const digests = listVerifierDigests();
  const verifications = nonces.map((nonce, i) => issueReceipt({
    resultId: overrides.resultId || resultId, evidenceDigest,
    verifierDigest: digests[i % digests.length], nonce,
    status: overrides.status || 'verified', independent: true
  }));
  const evaluation = { evaluation: { eligible: true }, allAccepted: true,
    assembly: { results: [{ resultId, evidence: { digest: evidenceDigest } }], verifications } };
  const persistedAssemblyId = await saveAssembly(db, evaluation, {
    runId: overrides.runId || 'run-a', scopeId: overrides.scopeId || 'org-a:project-a:workspace-a'
  });
  return { promotion: { runId: 'run-a', agentId: 'agent-a' },
    gateContext: { aeisEvaluation: { persistedAssemblyId } }, nonces };
}

async function nonceCount(db) {
  return (await db.get('SELECT COUNT(*) AS n FROM verifier_receipt_nonces')).n;
}

module.exports = { database, connect, assembly, nonceCount };
