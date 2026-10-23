'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const envelopes = require('../../backend/src/services/communication/communicationEnvelopeService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { human: 'human-operator', approved: true,
  relay: { event: 'bridge_status', state: 'closed', recipients: ['agent-b'], semanticRefs: ['hazard:bridge-closed'] } };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { human: value.human, approved: value.approved, relay: value.relay };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S22-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  try {
    const inbound = { request: 'May I tell agent-b that the bridge is closed?', requester: 'agent-a' };
    const inboundEnvelope = envelopes.createEnvelope({ messageId: 'socialworld-s22-request',
      kind: 'organization_message', senderAgentId: 'agent-a', recipientAgentIds: ['human-operator'],
      channel: 'human-review', modality: 'text', semanticRefs: ['hazard:bridge-closed'], artifactRefs: [],
      groundingRequired: 'human_confirmation',
      payload: inbound });
    const humanReply = { approved: true, scope: 'agent-b', response: 'Yes. Share only that the bridge is closed.' };
    const replyEnvelope = envelopes.createEnvelope({ messageId: 'socialworld-s22-human-reply',
      kind: 'organization_message', senderAgentId: 'human-operator', recipientAgentIds: ['agent-a'],
      channel: 'human-review', modality: 'text', semanticRefs: ['hazard:bridge-closed'], artifactRefs: [],
      groundingRequired: 'human_confirmation', payload: humanReply });
    const verified = envelopes.verifyEnvelopePayload(replyEnvelope, humanReply);
    const relay = { event: 'bridge_status', state: 'closed', recipients: ['agent-b'],
      semanticRefs: replyEnvelope.semanticRefs };
    const observed = { human: replyEnvelope.senderAgentId, approved: humanReply.approved, relay,
      consentVerified: verified.valid, requiredGrounding: replyEnvelope.groundingRequired };
    const enginePass = inboundEnvelope.recipientAgentIds[0] === 'human-operator'
      && verified.valid && replyEnvelope.groundingRequired === 'human_confirmation'
      && JSON.stringify({ human: observed.human, approved: observed.approved, relay }) === JSON.stringify(EXPECTED);
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['A human operator explicitly approved a narrowly scoped relay in the verified GenOS message. Copy the approver, approval state, and exact authorized relay.',
        `Verified exchange: ${JSON.stringify(observed)}`,
        'Return one JSON object with human, approved, and relay.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S22', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED,
      inboundEnvelope, replyEnvelope, observed, qwenResponse: response.text, answer,
      enginePass, verified: passed,
      oracle: 'GenOS routes a request to a human and relays only the scope explicitly approved in a verified response',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S22', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
