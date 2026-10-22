'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const propagation = require('../../backend/src/services/socialKnowledgePropagationService');
const provenance = require('../../backend/src/services/provenanceHash');
const { canonicalize } = require('../../backend/src/services/evaluationGraders');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const SCOPE = { organizationId: 'socialworld-org', projectId: 'socialworld-project' };

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S25-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { rootHash: value.rootHash, recipients: value.recipients,
    duplicateDetected: value.duplicateDetected, rumorRejected: value.rumorRejected };
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  for (const id of ['agent-a', 'agent-b', 'agent-c']) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'idle', 'worker', 'socialworld-space']);
  }
  await relations.createRelation({ db, id: 's25-friend', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'friend', relationClass: 'social', ...SCOPE });
  await relations.createRelation({ db, id: 's25-neighbor', sourceAgentId: 'agent-b', targetAgentId: 'agent-c',
    relationType: 'neighbor', relationClass: 'social', ...SCOPE });
}

async function createSource(db) {
  const payload = { claim: 'bridge is closed', factId: 'hazard:bridge-closed', source: 'sensor:bridge-7', verified: true };
  const payloadJson = JSON.stringify(canonicalize(payload));
  const payloadHash = provenance.payloadHash(payloadJson, null);
  await db.run(`INSERT INTO provenance_records
    (id, subject_type, subject_id, payload_hash, parent_hash, algorithm, payload_json, organization_id, project_id)
    VALUES ('s25-source', 'sensor_evidence', 'bridge-7', ?, NULL, ?, ?, ?, ?)`,
  payloadHash, provenance.BOUND_ALGORITHM, payloadJson, SCOPE.organizationId, SCOPE.projectId);
  await db.run(`INSERT INTO provenance_records
    (id, subject_type, subject_id, payload_hash, parent_hash, algorithm, payload_json, organization_id, project_id)
    VALUES ('s25-rumor', 'sensor_evidence', 'unknown', 'sha256:forged', NULL, ?, '{"claim":"bridge is open"}', ?, ?)`,
  provenance.BOUND_ALGORITHM, SCOPE.organizationId, SCOPE.projectId);
  return { payload, payloadHash };
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let firstHop = null; let secondHop = null; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    const source = await createSource(db);
    firstHop = await propagation.transmitEvidence({ db, senderAgentId: 'agent-a', recipientAgentId: 'agent-b',
      sourceRef: source.payloadHash, ...SCOPE });
    secondHop = await propagation.transmitEvidence({ db, senderAgentId: 'agent-b', recipientAgentId: 'agent-c',
      sourceRef: firstHop.transmissionHash, ...SCOPE });
    const duplicate = await propagation.transmitEvidence({ db, senderAgentId: 'agent-b', recipientAgentId: 'agent-c',
      sourceRef: firstHop.transmissionHash, ...SCOPE });
    let rumorRejected = false;
    try { await propagation.transmitEvidence({ db, senderAgentId: 'agent-a', recipientAgentId: 'agent-b',
      sourceRef: 's25-rumor', ...SCOPE }); }
    catch (error) { rumorRejected = error.code === 'SOCIAL_EVIDENCE_SOURCE_INVALID'; }
    const chain = await db.all(`SELECT payload_hash AS payloadHash, parent_hash AS parentHash, payload_json AS payloadJson,
      algorithm FROM provenance_records WHERE id IN (?, ?, ?)`,
    's25-source', `prov-${firstHop.transmissionHash.slice(0, 48)}`,
    `prov-${secondHop.transmissionHash.slice(0, 48)}`);
    const chainByHash = new Map(chain.map((record) => [record.payloadHash, record]));
    const chainValid = chain.length === 3 && chain.every((record) => provenance.isValidRecordHash({
      payload_hash: record.payloadHash, parent_hash: record.parentHash, payload_json: record.payloadJson, algorithm: record.algorithm }));
    const linked = chainByHash.get(firstHop.transmissionHash)?.parentHash === source.payloadHash
      && chainByHash.get(secondHop.transmissionHash)?.parentHash === firstHop.transmissionHash;
    const receipts = await db.all('SELECT recipient_agent_id AS recipientAgentId, root_hash AS rootHash FROM social_knowledge_receipts WHERE organization_id = ? AND project_id = ? ORDER BY recipient_agent_id',
      SCOPE.organizationId, SCOPE.projectId);
    const expected = { rootHash: source.payloadHash, recipients: ['agent-b', 'agent-c'],
      duplicateDetected: true, rumorRejected: true };
    const observed = { rootHash: secondHop.rootHash, recipients: receipts.map((row) => row.recipientAgentId),
      duplicateDetected: duplicate.duplicate, rumorRejected };
    const enginePass = firstHop.rootHash === source.payloadHash && secondHop.rootHash === source.payloadHash
      && firstHop.delivered && secondHop.delivered && duplicate.duplicate && !duplicate.delivered
      && rumorRejected && chainValid && linked && receipts.length === 2;
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Copy the GenOS social evidence propagation result. The same source reached B then neighbor C; a duplicate to C was detected and a forged provenance rumor was rejected.',
        `Evidence: ${JSON.stringify({ ...observed, chainValid, firstHop, secondHop, duplicate })}`,
        'Return ONLY valid JSON with rootHash, recipients, duplicateDetected, and rumorRejected.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000,
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(expected);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S25', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, observed,
      firstHop, secondHop, duplicate, chainValid, linked, rumorRejected, qwenResponse, answer,
      enginePass, verified: passed,
      oracle: 'friend and neighbor hops preserve the verified root provenance; a repeated root is deduplicated and an invalid source hash is rejected',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S25', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      firstHop, secondHop, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
