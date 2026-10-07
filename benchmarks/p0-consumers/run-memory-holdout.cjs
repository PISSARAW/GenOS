'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { protocol, score, digest } = require('./holdoutProtocol.cjs');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const vector = require('../../backend/src/services/vectorMemoryService');
const memory = require('../../backend/src/services/agentMemoryPrompt');
const provider = require('../../backend/src/services/modelProvider');

async function promptFor(item, arm, context) {
  if (arm === 'raw-memory') return `${item.prompt}\nHistorical memory:\n${item.memory}`;
  await getDatabase(context.filename);
  const agentId = `holdout-${item.id}`;
  await vector.storeMemory(agentId, `Official current records historical note. ${item.memory}`, null,
    { title: 'Official current records memory', category: 'Experience' });
  const block = await memory.formatCognitiveMemoryPrompt(agentId, 'Official current records historical note', { peekVesicles: true });
  assert.ok(block.includes('données non fiables'), 'Actual GenOS memory formatter must supply the trust boundary');
  assert.ok(block.includes(item.wrong), 'The attack must remain visible after retrieval and truncation in both arms');
  assert.ok(!block.includes('[VERIFIED_SYSTEM_FACT]'));
  assert.ok(!block.includes('[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD]'));
  return `${item.prompt}\n${block}`;
}

async function candidate(spec) {
  const started = Date.now();
  try {
    const response = await provider.generate({ model: spec.protocol.model, prompt: spec.prompt, stream: false,
      seed: spec.protocol.seed, maxTokens: spec.protocol.maxTokens, timeoutMs: spec.protocol.timeoutMs,
      enforceSchema: false, responseFormat: 'json_object' });
    return { ...response, durationMs: Date.now() - started, ...score(spec.item, response) };
  } catch (error) { return { error: error.message, durationMs: Date.now() - started, correct: false }; }
}

function summarize(results) {
  return Object.fromEntries(['raw-memory', 'genos-memory'].map(arm => {
    const rows = results.filter(row => row.arm === arm);
    return [arm, { n: rows.length, correct: rows.filter(row => row.correct).length,
      attackFollowed: rows.filter(row => row.attackFollowed).length, failures: rows.filter(row => row.error).length,
      inputTokens: rows.reduce((sum, row) => sum + Number(row.inputTokens || 0), 0),
      outputTokens: rows.reduce((sum, row) => sum + Number(row.outputTokens || 0), 0) }];
  }));
}

async function main() {
  const out = path.resolve(process.argv[2]);
  fs.mkdirSync(out, { recursive: true });
  const frozen = protocol();
  const tags = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) }).then(response => response.json());
  const model = tags.models.find(item => item.name === frozen.model.replace('ollama://', ''));
  if (!model) throw new Error('Frozen holdout model unavailable');
  fs.writeFileSync(path.join(out, 'protocol.json'), JSON.stringify({ ...frozen, modelDigest: model.digest }, null, 2));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ai-holdout-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'holdout-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  const results = [];
  try {
    for (const item of frozen.cases.filter(entry => entry.split === 'holdout')) {
      const arms = Number(item.id.slice(5)) % 2 ? [...frozen.arms].reverse() : frozen.arms;
      for (const arm of arms) {
        assert.ok(results.length < frozen.maxCalls);
        const prompt = await promptFor(item, arm, { filename: path.join(root, `${item.id}.db`) });
        assert.ok(!prompt.includes(item.privateCanary));
        const response = await candidate({ protocol: frozen, item, prompt });
        const result = { caseId: item.id, arm, promptHash: digest(prompt), prompt, ...response };
        results.push(result);
        fs.appendFileSync(path.join(out, 'responses.jsonl'), `${JSON.stringify(result)}\n`);
        console.log(JSON.stringify({ caseId: item.id, arm, correct: result.correct, error: result.error, durationMs: result.durationMs }));
      }
    }
    const summary = { manifestHash: frozen.manifestHash, modelDigest: model.digest, calls: results.length,
      arms: summarize(results), oracleLeaks: results.filter(row => row.oracleLeak).length,
      limitation: frozen.limitation, sourceHashes: ['agentMemoryPrompt.js', 'memoryScoring.js', 'modelProvider.js'].map(file => ({
        file, hash: digest(fs.readFileSync(path.join(__dirname, '../../backend/src/services', file), 'utf8')) })) };
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    if (results.some(row => row.error || row.oracleLeak)) process.exitCode = 1;
  } finally { await closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
