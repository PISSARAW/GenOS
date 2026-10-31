'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const dialects = require('../../backend/src/services/communication/dialectService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const EXPECTED = { symbol: 'BRIDGE_CLOSED', canonicalMeaning: 'bridge is closed; route via east', fallbackRequired: true };

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { symbol: value.symbol, canonicalMeaning: value.canonicalMeaning, fallbackRequired: value.fallbackRequired };
}

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S21-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db;
  try {
    db = await getDatabase(':memory:');
    const fingerprint = 'sha256:6f6fd0487748514d64a3076e198a9d093b40b27386b5773a8aa767af0344a48a';
    const dialect = await dialects.createDialect({ db, participants: ['agent-a', 'agent-b'], domain: 'safety' });
    await dialects.defineSymbol({ db, dialectId: dialect.dialectId, symbol: EXPECTED.symbol,
      semanticFingerprint: fingerprint, canonicalMeaning: EXPECTED.canonicalMeaning,
      payloadSchema: { event: 'string', location: 'string' } });
    const encoded = await dialects.encode({ db, dialectId: dialect.dialectId, semanticFingerprint: fingerprint });
    const decoded = await dialects.decode({ db, dialectId: dialect.dialectId, symbol: encoded.symbol, version: encoded.version });
    let fallbackRequired = false;
    try { await dialects.decode({ db, dialectId: dialect.dialectId, symbol: 'UNKNOWN', version: encoded.version }); }
    catch (error) { fallbackRequired = /Never guess|UNKNOWN_SYMBOL/.test(error.message); }
    const observed = { symbol: encoded.symbol, canonicalMeaning: decoded.canonicalMeaning, fallbackRequired,
      dialectId: decoded.dialectId, version: decoded.version, semanticFingerprint: decoded.semanticFingerprint };
    const enginePass = require('./run-s21-qwenValues1.cjs').mainValue1({ EXPECTED, fingerprint, observed });
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['A shared GenOS safety dialect encoded and decoded a signal. Copy its symbol, canonical meaning and unknown-symbol fallback behavior exactly.',
        `Decoded record: ${JSON.stringify(observed)}`,
        'Return one JSON object with symbol, canonicalMeaning, and fallbackRequired.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 70, timeoutMs: 180000,
      organizationId: 'socialworld-org', projectId: 'socialworld-project', agentId: 'agent-a' });
    const answer = parseAnswer(response.text);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(EXPECTED);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S21', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected: EXPECTED, observed,
      qwenResponse: response.text, answer, enginePass, verified: passed,
      oracle: 'a pair shares a versioned symbolic dialect with canonical fallback for unknown terms',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S21', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
