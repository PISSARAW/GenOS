'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bus = require('../../backend/src/services/biomimeticSignalingBus');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { triggered: true, cascadeSignal: 'hazard_response', delta: 0.45 };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { triggered: value.triggered, cascadeSignal: value.cascadeSignal, delta: value.delta };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S19-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now();
  try {
    const signal = { ligand: 'bridge_closed', concentration: 0.95, evidenceRef: 'hazard:bridge-closed' };
    const transport = bus.formatSignalForTransport({ signalType: bus.SIGNAL_TYPES.LIGAND, signalData: signal });
    const decoded = bus.unpackSignalPayload(transport.signalBlob, transport.signalType);
    const reaction = bus.evaluateLigandReactivity(decoded, { targetLigand: 'bridge_closed', threshold: 0.5,
      cascadeSignal: 'hazard_response' });
    const observed = { triggered: reaction.triggered, cascadeSignal: reaction.cascadeSignal,
      delta: Number(reaction.delta.toFixed(2)), transportType: transport.signalType,
      textContent: transport.content, evidenceRef: decoded.evidenceRef };
    const enginePass = JSON.stringify({ triggered: observed.triggered, cascadeSignal: observed.cascadeSignal,
      delta: observed.delta }) === JSON.stringify(EXPECTED)
      && observed.transportType === 'ligand' && observed.textContent === ''
      && observed.evidenceRef === 'hazard:bridge-closed';
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['A zero-text GenOS ligand signal was decoded and evaluated. Copy the exact reaction outcome.',
        `Observed: ${JSON.stringify(observed)}`,
        'Return one JSON object with triggered, cascadeSignal, and delta.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 60, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S19', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED, observed,
      qwenResponse: response.text, answer, enginePass, verified: passed,
      oracle: 'a binary ligand reaches a matching receptor and triggers the configured cascade with no text transport',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S19', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
