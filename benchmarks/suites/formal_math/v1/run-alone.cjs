'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadItems, leanIdentity, checkProof } = require('./oracle/check.cjs');

const model = process.argv[2] || 'qwen2.5:14b';
const taskId = process.argv[3] || 'nat-add-zero-01';
const leanPath = process.env.GENOS_LEAN_EXECUTABLE || 'lean';
const endpoint = process.env.OLLAMA_OPENAI_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const modelEndpoint = process.env.OLLAMA_TAGS_ENDPOINT || 'http://127.0.0.1:11434/api/tags';

async function modelIdentity() {
  const response = await fetch(modelEndpoint);
  if (!response.ok) throw new Error(`Ollama inventory HTTP ${response.status}`);
  const installed = (await response.json()).models?.find((entry) => entry.name === model);
  if (!installed?.digest) throw new Error(`Model ${model} is not installed.`);
  return installed;
}

async function ask(item) {
  const prompt = `Return one JSON object with taskId and proofBody. Supply only Lean 4 tactics for the proof body after := by. Do not write the theorem header, imports, axioms, sorry or admit.\nTask ID: ${item.taskId}\nStatement: ${item.naturalStatement}\nFixed Lean goal: ${item.formalStatement}`;
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, seed: 42, max_tokens: 512, stream: false,
      messages: [{ role: 'system', content: 'You are a Lean 4 proof assistant. Return only the requested JSON.' }, { role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: { name: 'lean_proof', strict: true,
        schema: { type: 'object', properties: { taskId: { type: 'string', enum: [item.taskId] }, proofBody: { type: 'string' } },
          required: ['taskId', 'proofBody'], additionalProperties: false } } } })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  return { prediction: JSON.parse(payload.choices?.[0]?.message?.content || '{}'), servedModel: payload.model,
    usage: payload.usage || null };
}

async function main() {
  const { corpus, corpusDigest } = loadItems();
  const item = corpus.items.find((entry) => entry.taskId === taskId);
  if (!item) throw new Error(`Unknown taskId: ${taskId}`);
  const lean = leanIdentity(leanPath);
  if (lean.version !== corpus.toolchain) throw new Error(`Lean mismatch: expected ${corpus.toolchain}; got ${lean.raw}`);
  const installed = await modelIdentity();
  const startedAt = new Date().toISOString();
  const response = await ask(item);
  const validIdentity = response.servedModel === model;
  const oracle = response.prediction.taskId === taskId
    ? await checkProof(item, response.prediction.proofBody, lean)
    : { passed: false, reason: 'task_id_mismatch' };
  const runDir = path.join(__dirname, 'results', `${startedAt.replace(/[:.]/g, '-')}-alone-${taskId}`);
  fs.mkdirSync(runDir, { recursive: true });
  const receipt = { schemaVersion: 1, mode: 'alone', taskId, corpusDigest, requestedModel: model,
    servedModel: response.servedModel, modelIdentityVerified: validIdentity, modelArtifactDigest: installed.digest,
    leanVersion: lean.raw, startedAt, finishedAt: new Date().toISOString(), usage: response.usage,
    prediction: response.prediction, oracle, comparisonEligible: false };
  fs.writeFileSync(path.join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ runDir, ...receipt }, null, 2));
  if (!validIdentity || !oracle.passed) process.exitCode = 2;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
