const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verifySnapshot } = require('./oracle/score.cjs');

const SUITE_DIR = __dirname;
const PUBLIC_DIR = path.join(SUITE_DIR, 'public');
const MODEL = process.argv[2] || 'qwen2.5-coder:7b';
const ENDPOINT = process.env.OLLAMA_OPENAI_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const TAGS_ENDPOINT = process.env.OLLAMA_TAGS_ENDPOINT || 'http://127.0.0.1:11434/api/tags';

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadSnapshot(lock, selectedPaths) {
  return lock.files.filter((entry) => selectedPaths.includes(entry.path))
    .map((entry) => {
      const lines = fs.readFileSync(path.join(PUBLIC_DIR, 'snapshot', entry.path), 'utf8').split(/\r?\n/);
      return `\n===== ${entry.path}; one-based line numbers =====\n${lines.map((line, index) => `${index + 1}\t${line}`).join('\n')}`;
    }).join('\n');
}

function inputDigest(item, lock) {
  const files = lock.files.filter((entry) => item.snapshotFiles.includes(entry.path));
  const request = { taskId: item.taskId, prompt: item.prompt, snapshotFiles: item.snapshotFiles, requiredClaimKeys: item.requiredClaimKeys, claimTypes: item.claimTypes };
  return digest(JSON.stringify({ request, files: files.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 })) }));
}

async function inspectModel() {
  const response = await fetch(TAGS_ENDPOINT);
  if (!response.ok) throw new Error(`Ollama model inventory failed with HTTP ${response.status}.`);
  const inventory = await response.json();
  const model = (inventory.models || []).find((entry) => entry.name === MODEL);
  if (!model?.digest) throw new Error(`Requested model '${MODEL}' is not present in the local Ollama inventory.`);
  return { requestedModel: MODEL, digest: model.digest, size: model.size };
}

async function askModel(item, snapshotLock) {
  const snapshotText = loadSnapshot(snapshotLock, item.snapshotFiles);
  const prompt = `Snapshot autorisé (les préfixes numériques sont les numéros de ligne, à exclure du champ quote) :\n${snapshotText}\n\nQuestion ${item.taskId} : ${item.prompt}\n\nLes valeurs de claims doivent être les réponses directes, pas des objets de citation. Les citations sont séparées dans citations et contiennent path, startLine, endLine, quote. Respecte exactement le schéma JSON imposé.`;
  const claimProperties = Object.fromEntries(item.requiredClaimKeys.map((key) => [
    key,
    item.claimTypes[key] === 'array' ? { type: 'array', items: { type: 'string' } } : { type: item.claimTypes[key] }
  ]));
  const responseSchema = {
    type: 'json_schema',
    json_schema: {
      name: 'repository_analysis_response',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', enum: [item.taskId] },
          claims: { type: 'object', properties: claimProperties, required: item.requiredClaimKeys, additionalProperties: false },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, startLine: { type: 'integer' }, endLine: { type: 'integer' }, quote: { type: 'string' } },
              required: ['path', 'startLine', 'endLine', 'quote'],
              additionalProperties: false
            }
          }
        },
        required: ['taskId', 'claims', 'citations'],
        additionalProperties: false
      }
    }
  };
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: `Analyse uniquement le snapshot fourni. N’utilise aucune source externe. Retourne taskId=${item.taskId}, une valeur directe pour chaque clé claims et des citations exactes dans citations. Pas de résumé.` },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 2048,
      response_format: responseSchema,
      stream: false
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Ollama returned no message content.');
  return {
    prediction: JSON.parse(content),
    usage: payload.usage || null,
    servedModel: payload.model || null,
    responseDigest: digest(content)
  };
}

async function runAlone() {
  const snapshotLock = verifySnapshot();
  const modelInfo = await inspectModel();
  const questionPath = path.join(PUBLIC_DIR, 'questions.json');
  const answerKeyPath = path.join(__dirname, 'oracle', 'answer-key.json');
  const questionBytes = fs.readFileSync(questionPath);
  const questions = JSON.parse(questionBytes.toString('utf8'));
  const startedAt = new Date().toISOString();
  const observations = [];
  for (const item of questions.items) {
    const outcome = await askModel(item, snapshotLock);
    observations.push({
      prediction: { ...outcome.prediction, taskId: item.taskId },
      promptDigest: inputDigest(item, snapshotLock),
      usage: outcome.usage,
      servedModel: outcome.servedModel,
      responseDigest: outcome.responseDigest
    });
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
    oracleDigest: digest(fs.readFileSync(answerKeyPath)),
    snapshot: snapshotLock,
    temperature: 0,
    seed: 42,
    startedAt,
    finishedAt: new Date().toISOString(),
    observations
  };
  fs.writeFileSync(path.join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  const scored = require('./oracle/score.cjs').scorePredictions(observations.map((entry) => entry.prediction));
  fs.writeFileSync(path.join(runDir, 'score.json'), `${JSON.stringify(scored, null, 2)}\n`);
  return { runDir, meanScore: scored.meanScore, itemCount: scored.itemCount };
}

runAlone().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
