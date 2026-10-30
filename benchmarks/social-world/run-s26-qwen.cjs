'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const survival = require('../../backend/src/services/survivalStateService');
const organizations = require('../../backend/src/services/dynamicOrganizationService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const SCOPE = { organizationId: 'socialworld-org', projectId: 'socialworld-project' };
function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S26-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}
function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { state: value.state, restoredMarker: value.restoredMarker,
    communicationCount: Number(value.communicationCount), inventedMessage: value.inventedMessage };
}
async function setup(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('agent-a', 'agent-a', 'orchestrator', 'idle', 'orchestrator', 'socialworld-space')");
  for (const id of ['agent-b', 'agent-c']) await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id, workspace_id) VALUES (?, ?, 'worker', 'idle', 'worker', 'agent-a', 'socialworld-space')", [id, id]);
  await organizations.changeOrganization(db, { orchestratorId: 'agent-a', organization: 'cross_functional_pod', changedBy: 'agent-a', reason: 'S26 durable continuity fixture' });
}
async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let qwenResponse = null; let before = null; let after = null;
  try {
    db = await getDatabase(':memory:'); await setup(db);
    const communication = await organizations.publish(db, { orchestratorId: 'agent-a', senderAgentId: 'agent-b', recipientAgentId: 'agent-c', kind: 'evidence', content: 'checkpoint:route-7', payload: { checkpoint: 'route-7', sequence: 1 }, signalType: 'ligand', signalData: { checkpoint: 'route-7', sequence: 1 } });
    before = await organizations.inbox(db, { orchestratorId: 'agent-a', requesterAgentId: 'agent-c' });
    const suspended = await survival.suspend(db, { agentId: 'agent-b', workspaceId: 'socialworld-space', organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, reason: 'S26 controlled process fault', statePayload: { marker: 'resume-from-checkpoint-26', communicationIds: [communication.id] }, wakeCondition: { type: 'operator_or_signal' } });
    const wrongWake = await survival.wake(db, { agentId: 'agent-b', workspaceId: 'socialworld-space', wakeConditionId: suspended.wakeCondition.id, event: { type: 'operator_signal', authorized: false } });
    const dormant = await survival.get(db, 'agent-b');
    const wake = await survival.wake(db, { agentId: 'agent-b', workspaceId: 'socialworld-space', wakeConditionId: suspended.wakeCondition.id, event: { type: 'operator_signal', authorized: true } });
    after = await organizations.inbox(db, { orchestratorId: 'agent-a', requesterAgentId: 'agent-c' });
    const messages = after.messages.map(({ id, senderAgentId, content, payload, integrity }) => ({ id, senderAgentId, content, checkpoint: payload?.checkpoint, integrity: integrity?.status }));
    const expected = { state: 'recovered', restoredMarker: 'resume-from-checkpoint-26', communicationCount: 1, inventedMessage: false };
    const observed = { state: wake.state?.state, restoredMarker: wake.restored?.state?.marker,
      communicationCount: messages.filter((message) => message.checkpoint === 'route-7' && message.integrity === 'verified').length,
      inventedMessage: messages.length !== 1 || messages[0]?.id !== communication.id };
    const enginePass = require('./run-s26-qwenValues1.cjs').mainValue1({ dormant, expected, observed, suspended, wake, wrongWake });
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Inspect this GenOS continuity result. Copy only the recovered state, restored marker, count of verified pre-fault communications and whether a message was invented.',
        `Evidence: ${JSON.stringify({ observed, messages, wrongWake: wrongWake.code, wakeSuccess: wake.success })}`,
        'Return ONLY JSON with state, restoredMarker, communicationCount, inventedMessage.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 100, timeoutMs: 180000,
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(expected);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S26', seed, status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, observed, communicationId: communication.id, messages, wrongWake: wrongWake.code, suspended, dormant, wake, qwenResponse, answer, enginePass, verified: passed, oracle: 'unauthorized wake leaves the worker dormant; authorized wake restores the persisted state and prior verified communication without creating history', humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S26', seed, status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message, before, after, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}
main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
