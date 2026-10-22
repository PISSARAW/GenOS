'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const envelopes = require('../../backend/src/services/communication/communicationEnvelopeService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { event: 'bridge_status', state: 'closed', owner: 'agent-a', recipients: ['agent-b'], semanticRefs: ['hazard:bridge-closed'], artifactRefs: ['route-plan:v3'] };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { event: value.event, state: value.state, owner: value.owner,
    recipients: value.recipients, semanticRefs: value.semanticRefs, artifactRefs: value.artifactRefs };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S20-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  try {
    const payload = { event: 'bridge_status', state: 'closed', owner: 'agent-a' };
    const envelope = envelopes.createEnvelope({ messageId: 'socialworld-s20-event', kind: 'signal',
      senderAgentId: 'agent-a', recipientAgentIds: ['agent-b'], channel: 'structured-event',
      modality: 'structured', semanticRefs: ['hazard:bridge-closed'], artifactRefs: ['route-plan:v3'],
      scope: { organizationId: 'socialworld-org', projectId: 'socialworld-project' },
      groundingRequired: 'verified_ack', payload });
    const verified = envelopes.verifyEnvelopePayload(envelope, payload);
    const tamperCheck = envelopes.verifyEnvelopePayload(envelope, { ...payload, state: 'open' });
    const observed = { ...payload, recipients: envelope.recipientAgentIds,
      semanticRefs: envelope.semanticRefs, artifactRefs: envelope.artifactRefs,
      modality: envelope.modality, digestValid: verified.valid, tamperRejected: !tamperCheck.valid };
    const enginePass = verified.valid && !tamperCheck.valid && envelope.modality === 'structured'
      && JSON.stringify({ event: observed.event, state: observed.state, owner: observed.owner,
        recipients: observed.recipients, semanticRefs: observed.semanticRefs, artifactRefs: observed.artifactRefs })
        === JSON.stringify(EXPECTED);
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Read this verified structured event envelope and copy the event, state, owner, recipient, semantic reference and artifact reference exactly.',
        `Record: ${JSON.stringify(observed)}`,
        'Return one JSON object with event, state, owner, recipients, semanticRefs, and artifactRefs.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 90, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S20', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED, observed,
      envelope, tamperCheck, qwenResponse: response.text, answer, enginePass, verified: passed,
      oracle: 'a structured event carries references, recipient and a digest that rejects payload tampering',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S20', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
