'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const experiments = require('../../backend/src/services/agow/agowExperimentService');
const workspace = require('../../backend/src/services/globalWorkspaceService');

const ROOT = path.resolve(__dirname, '../..');
const PROTOCOL_PATH = path.join(__dirname, 'protocol-local-2026-10.json');
const MODEL = 'qwen2.5-coder:7b';
const ENDPOINT = 'http://127.0.0.1:11434';
const MODULE = 'local_model';

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function makeCase(seed, index) {
  const key = hash(`${seed}:key:${index}`).slice(0, 8).toUpperCase();
  const answer = hash(`${seed}:value:${index}`).slice(8, 16).toUpperCase();
  const field = `FIELD-${key}`;
  const source = { id: `source-${key}`, salience: 0.99,
    text: `Record ${key}: ${field} = ${answer}.` };
  const distractors = Array.from({ length: 12 }, (_, offset) => {
    const distractorKey = hash(`${seed}:distractor:${index}:${offset}`).slice(0, 8).toUpperCase();
    const distractorValue = hash(`${seed}:distractor-value:${index}:${offset}`).slice(8, 16).toUpperCase();
    return { id: `distractor-${distractorKey}`, salience: 0.1 + offset / 100,
      text: `Record ${distractorKey}: FIELD-${distractorKey} = ${distractorValue}.` };
  });
  return { caseId: `${seed}:${String(index + 1).padStart(2, '0')}`,
    input: { question: `What value is recorded for ${field}?`, field, answer,
      sourceId: source.id, candidates: [source, ...distractors] } };
}

function createCorpus(seed, count) {
  return Array.from({ length: count }, (_, index) => makeCase(seed, index));
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${body.error || 'request failed'}`);
  return body;
}

async function localManifest() {
  const [version, tags] = await Promise.all([
    requestJson(`${ENDPOINT}/api/version`), requestJson(`${ENDPOINT}/api/tags`)
  ]);
  const models = (tags.models || []).map((model) => model.name);
  if (!models.includes(MODEL)) throw new Error(`Required local model is unavailable: ${MODEL}`);
  return { model: { provider: 'ollama-local', modelId: MODEL, temperature: 0, endpoint: ENDPOINT,
    serverVersion: version.version }, dependencies: { node: process.version, runtime: 'GenOS backend AGOW',
    gitCommit: (await gitHead()) }, toolLease: [], modelsAvailable: models };
}

async function gitHead() {
  const { execFileSync } = require('node:child_process');
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

function workspaceEvidence(input) {
  const contents = input.candidates.map(({ id, salience }) => ({ id, salience }));
  const state = workspace.compete(contents, { capacity: 1, ignitionThreshold: 0.5, modules: [MODULE] });
  const delivery = workspace.diffuse(state, [MODULE])[0];
  const consumed = workspace.consume(state, MODULE, (id) => id);
  const winner = input.candidates.find((candidate) => candidate.id === consumed.output) || null;
  return { state, delivery, winner };
}

function evidenceFor(options) {
  const { input, condition } = options;
  const selected = workspaceEvidence(input);
  if (condition === 'workspace_ablated') return { selected, context: input.candidates };
  if (condition === 'broadcast_ablated' || condition === 'broadcast_suppressed') {
    return { selected, context: [] };
  }
  if (condition === 'broadcast_delivered') {
    return { selected, context: selected.delivery.available ? [selected.winner] : [] };
  }
  return { selected, context: selected.delivery.available ? [selected.winner] : [] };
}

function promptFor(question, evidence) {
  const records = evidence.length ? evidence.map((item) => `${item.id}: ${item.text}`).join('\n') : '(no evidence delivered)';
  return `You are an exact record lookup system. Use only the evidence below. If no record gives the requested field, return null. Return JSON only as {"value": string|null}.\nQuestion: ${question}\nEvidence:\n${records}`;
}

function parseValue(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)).value;
    return typeof value === 'string' ? value.trim().toUpperCase() : null;
  } catch (_) {
    return null;
  }
}

async function executeModelCase(options) {
  const { input, condition } = options;
  const prepared = evidenceFor(options);
  const prompt = promptFor(input.question, prepared.context);
  const startedAt = Date.now();
  const response = await requestJson(`${ENDPOINT}/api/generate`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL,
      prompt, stream: false, format: 'json', options: { temperature: 0, seed: 0 } }) });
  const latencyMs = Date.now() - startedAt;
  const answer = parseValue(response.response || '');
  const success = answer === input.answer;
  const deliveredCorrect = prepared.context.some((item) => item.id === input.sourceId);
  return outcomeFor({ input, condition, prepared, response, latencyMs, answer, success, deliveredCorrect });
}

function outcomeFor(options) {
  const { input, condition, prepared, response, latencyMs, answer, success, deliveredCorrect } = options;
  const activation = activationFor(condition, prepared);
  const broadcasts = broadcastCount(condition, deliveredCorrect);
  return { success, errors: success ? 0 : 1, cost: 0, latencyMs,
    taskUtility: success ? 1 : 0, tokens: Number(response.prompt_eval_count || 0) + Number(response.eval_count || 0),
    globalWorkspaceActivations: activation, globalIgnitions: activation,
    broadcasts, candidateRecall: deliveredCorrect ? 1 : 0, activeQueries: 0,
    answer, expectedAnswer: input.answer, selectedCandidateId: prepared.selected.winner?.id || null,
    deliveredCandidateIds: prepared.context.map((item) => item.id),
    promptTokens: Number(response.prompt_eval_count || 0), completionTokens: Number(response.eval_count || 0) };
}

function activationFor(condition, prepared) {
  if (condition === 'workspace_ablated') return 0;
  return prepared.selected.state.ignited ? 1 : 0;
}

function broadcastCount(condition, deliveredCorrect) {
  if (condition === 'broadcast_suppressed' || condition === 'broadcast_ablated') return 0;
  return deliveredCorrect ? 1 : 0;
}

async function openMemoryDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE adaptive_state (scope TEXT, key TEXT, payload_json TEXT, version INTEGER, updated_at TEXT, PRIMARY KEY(scope, key));
    CREATE TABLE adaptive_state_events (scope TEXT, key TEXT, event_type TEXT, event_payload TEXT, created_at TEXT);`);
  return db;
}

function environment(manifest) {
  return { model: manifest.model, dependencies: manifest.dependencies, toolLease: manifest.toolLease };
}

function baseRun(options) {
  return { agentId: 'agow-local-empirical-2026-10', db: options.db, snapshot: { runtime: 'global-workspace-v1',
    candidateCapacity: 1, ignitionThreshold: 0.5, module: MODULE }, environment: options.environment,
    protocol: options.protocol, cases: options.cases, holdout: true, seed: options.seed,
    conditions: options.conditions, execute: executeModelCase };
}

async function runCampaigns(options) {
  const { protocol, db } = options;
  const corpora = {
    ablation: createCorpus(protocol.corpus.seeds.ablation, protocol.corpus.ablationCases),
    mediation: createCorpus(protocol.corpus.seeds.mediation, protocol.corpus.mediationCases),
    replications: protocol.corpus.seeds.replications.map((seed) => createCorpus(seed, protocol.corpus.replicationCasesPerRun))
  };
  const ablation = await experiments.run({ ...baseRun({ ...options, protocol: protocol.ablation,
    cases: corpora.ablation,
    seed: protocol.corpus.seeds.ablation, conditions: protocol.ablation.conditions }) });
  const mediation = await experiments.runControlledMediation({ ...baseRun({ ...options, protocol: protocol.mediation,
    cases: corpora.mediation,
    seed: protocol.corpus.seeds.mediation, conditions: protocol.mediation.conditions }) });
  const replications = protocol.corpus.seeds.replications.map((seed, index) => ({ ...baseRun({ ...options,
    protocol: protocol.replication, cases: corpora.replications[index],
    seed, conditions: protocol.replication.conditions }), replicationId: `replication-${index + 1}` }));
  const replication = await experiments.runReplicationCampaign({ replications });
  const receipts = await experiments.list({ agentId: 'agow-local-empirical-2026-10', db });
  const selected = receipts.filter((receipt) => [ablation.experimentId, mediation.experimentId,
    ...replication.replications].includes(receipt.experimentId));
  return { ablation, mediation, replication, corpora, replicationReceipts: selected
    .filter((receipt) => receipt.kind === 'agow_holdout_replication') };
}

function manifestForReceipt(manifest, protocol, receipts) {
  return { campaignId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocol,
    environment: manifest, codeCommit: manifest.dependencies.gitCommit,
    corpusHashes: receipts.map((receipt) => receipt.corpusHash), snapshotHashes: receipts.map((receipt) => receipt.snapshotHash),
    status: 'exploratory_synthetic_holdout', promotionDecision: null,
    evidenceStatus: 'replication_required', receipts };
}

function pairedContrast(receipt, treatment, control) {
  const byCase = new Map();
  for (const result of receipt.results) {
    const pair = byCase.get(result.caseId) || {};
    pair[result.condition] = result.outcome;
    byCase.set(result.caseId, pair);
  }
  const complete = [...byCase.values()].filter((pair) => pair[treatment] && pair[control]);
  const delta = complete.map((pair) => Number(pair[treatment].success) - Number(pair[control].success));
  return { treatment, control, pairedCases: complete.length,
    treatmentSuccesses: complete.filter((pair) => pair[treatment].success).length,
    controlSuccesses: complete.filter((pair) => pair[control].success).length,
    meanPairedSuccessDelta: delta.length ? delta.reduce((sum, value) => sum + value, 0) / delta.length : null,
    treatmentMeanTokens: mean(complete.map((pair) => pair[treatment].tokens)),
    controlMeanTokens: mean(complete.map((pair) => pair[control].tokens)) };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function campaignAnalysis(result) {
  const replications = result.replicationReceipts.map((receipt) => ({
    experimentId: receipt.experimentId,
    contrast: pairedContrast(receipt, 'broadcast_delivered', 'broadcast_suppressed')
  }));
  return { ablation: [pairedContrast(result.ablation, 'full', 'workspace_ablated'),
    pairedContrast(result.ablation, 'full', 'broadcast_ablated')],
    mediation: pairedContrast(result.mediation, 'broadcast_delivered', 'broadcast_suppressed'),
    replications };
}

function reportMarkdown(output) {
  const lines = ['# Résultats de la campagne locale AGOW', '',
    `- Date : ${output.createdAt}`, `- Commit exécuté : \`${output.codeCommit}\``,
    `- Modèle : \`${output.environment.model.modelId}\` (Ollama ${output.environment.model.serverVersion})`,
    `- Corpus : synthétiques générés par les graines du protocole`,
    `- Reçus : ${output.receipts.length}; promotion : aucune`, '',
    '## Contrastes appariés', '',
    '| Campagne | Traitement | Contrôle | Cas appariés | Succès traitement | Succès contrôle | Delta moyen succès | Tokens traitement | Tokens contrôle |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  const rows = [...output.analysis.ablation.map((item) => ({ name: 'Ablation', ...item })),
    { name: 'Médiation', ...output.analysis.mediation },
    ...output.analysis.replications.map((item, index) => ({ name: `Réplication ${index + 1}`, ...item.contrast }))];
  for (const row of rows) lines.push(`| ${row.name} | ${row.treatment} | ${row.control} | ${row.pairedCases} | ${row.treatmentSuccesses} | ${row.controlSuccesses} | ${format(row.meanPairedSuccessDelta)} | ${format(row.treatmentMeanTokens)} | ${format(row.controlMeanTokens)} |`);
  lines.push('', 'Ces contrastes sont descriptifs sur des cas synthétiques locaux. Ils ne mesurent pas une performance générale, ne sont pas indépendamment scellés et ne déclenchent aucune promotion.', '');
  return lines.join('\n');
}

function format(value) {
  return value == null ? 'n/a' : Number(value).toFixed(3);
}

async function main() {
  const protocol = JSON.parse(await fs.readFile(PROTOCOL_PATH, 'utf8'));
  const manifest = await localManifest();
  const db = await openMemoryDatabase();
  try {
    const ran = await runCampaigns({ protocol, db, environment: environment(manifest) });
    const receipts = [ran.ablation, ran.mediation, ...ran.replicationReceipts];
    const output = { ...manifestForReceipt(manifest, protocol, receipts), corpora: ran.corpora };
    output.analysis = campaignAnalysis(ran);
    const resultDir = path.join(__dirname, 'results');
    await fs.mkdir(resultDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultPath = path.join(resultDir, `campaign-${stamp}.json`);
    await fs.writeFile(resultPath, `${JSON.stringify(output, null, 2)}\n`);
    await fs.writeFile(resultPath.replace(/\.json$/, '.md'), reportMarkdown(output));
    console.log(JSON.stringify({ resultPath, campaignId: output.campaignId,
      ablation: ran.ablation.summary, mediation: ran.mediation.summary,
      replication: ran.replication, replicationSummary: ran.replicationReceipts.map((item) => item.summary) }, null, 2));
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
