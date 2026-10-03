const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { scorePredictions, verifySources } = require('./oracle/score.cjs');

const SUITE_DIR = __dirname;
const PUBLIC_DIR = path.join(SUITE_DIR, 'public');
const MODEL = process.argv[2] || 'qwen2.5-coder:7b';
const ENDPOINT = process.env.OLLAMA_OPENAI_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const TAGS_ENDPOINT = process.env.OLLAMA_TAGS_ENDPOINT || 'http://127.0.0.1:11434/api/tags';

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceText(lock, sourceIds) {
  if (!Array.isArray(sourceIds) || !sourceIds.length || new Set(sourceIds).size !== sourceIds.length) throw new Error('Question sourceIds must list unique locked sources.');
  const files = lock.files.filter((file) => sourceIds.includes(file.sourceId));
  if (files.length !== sourceIds.length) throw new Error('Question sourceIds do not match the locked source cards.');
  return files.map((file) => `\n===== ${file.sourceId} | ${file.url} | ${file.version} =====\n${fs.readFileSync(path.join(PUBLIC_DIR, 'sources', file.path), 'utf8')}`).join('\n');
}

async function inspectModel() {
  const response = await fetch(TAGS_ENDPOINT);
  if (!response.ok) throw new Error(`Ollama model inventory failed: HTTP ${response.status}`);
  const model = (await response.json()).models?.find((entry) => entry.name === MODEL);
  if (!model?.digest) throw new Error(`Requested model '${MODEL}' is not present locally.`);
  return model;
}

function responseSchema(item) {
  const claims = Object.fromEntries(item.requiredClaimKeys.map((key) => {
    const type = item.claimTypes[key];
    return [key, type === 'array' ? { type, items: { type: 'string' } } : { type }];
  }));
  return {
    type: 'json_schema',
    json_schema: {
      name: 'factual_research_response',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', enum: [item.taskId] },
          claims: { type: 'object', properties: claims, required: item.requiredClaimKeys, additionalProperties: false },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: { sourceId: { type: 'string' }, section: { type: 'string' }, factId: { type: 'string' } },
              required: ['sourceId', 'section', 'factId'],
              additionalProperties: false
            }
          }
        },
        required: ['taskId', 'claims', 'citations'],
        additionalProperties: false
      }
    }
  };
}

async function ask(item, frozenSources) {
  const prompt = `Question ${item.taskId}: ${item.prompt}\n\nOnly these frozen sources are allowed:\n${frozenSources}\n\nAnswer in French. Return only the required JSON; cite precise sourceId, section and factId values from the source cards.`;
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Use only the supplied frozen sources. Do not use external knowledge. Return a concise evidence-backed JSON answer.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 1024,
      response_format: responseSchema(item),
      stream: false
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Ollama returned no answer.');
  return { prediction: JSON.parse(content), usage: payload.usage || null, servedModel: payload.model || null };
}

async function runAlone() {
  const sourceState = verifySources();
  const modelInfo = await inspectModel();
  const questionBytes = fs.readFileSync(path.join(PUBLIC_DIR, 'questions.json'));
  const questions = JSON.parse(questionBytes.toString('utf8'));
  const startedAt = new Date().toISOString();
  const observations = [];
  for (const item of questions.items) {
    const outcome = await ask(item, sourceText(sourceState.lock, item.sourceIds));
    observations.push({ prediction: { ...outcome.prediction, taskId: item.taskId }, usage: outcome.usage, servedModel: outcome.servedModel });
    console.log(`${item.taskId}: response received from ${outcome.servedModel || MODEL}`);
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-alone`;
  const runDir = path.join(SUITE_DIR, 'results', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'predictions.jsonl'), `${observations.map((entry) => JSON.stringify(entry.prediction)).join('\n')}\n`);
  const receipt = {
    schemaVersion: 1,
    runId,
    mode: 'alone',
    provider: 'ollama-local',
    requestedModel: MODEL,
    servedModels: [...new Set(observations.map((entry) => entry.servedModel))],
    modelArtifactDigest: modelInfo.digest,
    modelArtifactSize: modelInfo.size,
    questionSetDigest: digest(questionBytes),
    oracleDigest: digest(fs.readFileSync(path.join(SUITE_DIR, 'oracle', 'answer-key.json'))),
    sourceLock: sourceState.lock,
    temperature: 0,
    seed: 42,
    startedAt,
    finishedAt: new Date().toISOString(),
    observations
  };
  fs.writeFileSync(path.join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  const score = scorePredictions(observations.map((entry) => entry.prediction));
  fs.writeFileSync(path.join(runDir, 'score.json'), `${JSON.stringify(score, null, 2)}\n`);
  return { runDir, meanScore: score.meanScore, itemCount: score.itemCount };
}

runAlone().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
