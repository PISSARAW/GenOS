'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const modelProvider = require('../src/services/modelProvider');
const { fingerprint } = require('../src/services/stateFingerprint');
const endocrine = require('../src/services/shev/developmentalEndocrineBridge');
const campaign = require('../src/services/shev/developmentalLongitudinalCampaignService');
const ledger = require('../src/services/gvxDevelopmentLedger');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');

const ROOT = path.resolve(__dirname, '../..');
const TASK_DEFINITIONS = [
  { id: 'pain-capability-gap-weight', phase: 'training',
    file: 'backend/src/services/shev/developmentalEndocrineBridge.js', fn: 'observationWeight',
    question: "Return the weight for kind 'capability_gap'.", choices: ['0.5', '0.35', '0.2'], expected: '0.5' },
  { id: 'pain-degradation-weight', phase: 'training',
    file: 'backend/src/services/shev/developmentalEndocrineBridge.js', fn: 'observationWeight',
    question: "Return the weight for kind 'degradation'.", choices: ['0.35', '0.5', '0.2'], expected: '0.35' },
  { id: 'pain-blindspot-weight', phase: 'training',
    file: 'backend/src/services/shev/developmentalEndocrineBridge.js', fn: 'observationWeight',
    question: "Return the weight for kind 'blind_spot'.", choices: ['0.2', '0.35', '0.5'], expected: '0.2' },
  { id: 'pain-recurrence-signal', phase: 'training',
    file: 'backend/src/services/shev/developmentalEndocrineBridge.js', fn: 'addRecurrences',
    question: 'Return the increments for relapsed and scarred, in that order.',
    choices: ['relapsed=0.35;scarred=0.15', 'relapsed=0.15;scarred=0.35', 'both=0.35'],
    expected: 'relapsed=0.35;scarred=0.15' },
  { id: 'pain-progress-clearance-gate', phase: 'training',
    file: 'backend/src/services/shev/developmentalEndocrineBridge.js', fn: 'recordProgressAndClear',
    question: 'Which progress verdict permits hormonal clearance?',
    choices: ['confirmed_only', 'inconclusive', 'any_non_regression'], expected: 'confirmed_only' },
  { id: 'heldout-minimum-contexts', phase: 'heldout',
    file: 'backend/src/services/shev/agentProgressService.js', fn: 'validHeldoutWindows',
    question: 'How many distinct held-out context windows are required at minimum?',
    choices: ['2', '1', '3'], expected: '2' },
  { id: 'heldout-transfer-states', phase: 'heldout',
    file: 'backend/src/services/shev/agentProgressService.js', fn: 'heldoutWindows',
    question: 'Which states allow transfer progress assessment?',
    choices: ['monitored,consolidated', 'approved,completed', 'healed,scarred'],
    expected: 'monitored,consolidated' },
  { id: 'heldout-curriculum-cap', phase: 'heldout',
    file: 'backend/src/services/shev/runtimeActions.js', fn: 'developmentCandidates',
    question: 'How many prioritized development jobs are selected at most?',
    choices: ['5', '10', '100'], expected: '5' },
  { id: 'heldout-training-separation', phase: 'heldout',
    file: 'backend/src/services/shev/agentProgressService.js', fn: 'heldoutWindows',
    question: 'Must held-out contexts be excluded from training contexts?',
    choices: ['yes', 'no'], expected: 'yes' },
  { id: 'heldout-independent-clearance', phase: 'heldout',
    file: 'backend/src/services/shev/developmentalEndocrineBridge.js', fn: 'recordProgressAndClear',
    question: 'What decay_factor is requested after confirmed progress?',
    choices: ['0.25', '0.5', '1'], expected: '0.25' }
];

function sourceAtHead(relative) {
  return execFileSync('git', ['show', `HEAD:${relative}`], { cwd: ROOT, encoding: 'utf8' });
}

function functionExcerpt(source, name) {
  const marker = `function ${name}(`;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Could not read benchmark source function ${name}.`);
  const start = source.lastIndexOf('\n', index) + 1;
  const tail = source.slice(index + marker.length);
  const next = tail.search(/\n(?:async )?function [A-Za-z_$][\w$]*\(/);
  return source.slice(start, next < 0 ? source.length : index + marker.length + next).trim();
}

function taskSet() {
  const fileSources = new Map([...new Set(TASK_DEFINITIONS.map((task) => task.file))]
    .map((file) => [file, sourceAtHead(file)]));
  const tasks = TASK_DEFINITIONS.map((task) => ({ ...task,
    source: functionExcerpt(fileSources.get(task.file), task.fn),
    sourceHash: fingerprint(fileSources.get(task.file)) }));
  const sourceSnapshotHash = fingerprint(Object.fromEntries([...fileSources]
    .map(([file, source]) => [file, fingerprint(source)])));
  return { tasks, sourceSnapshotHash };
}

const TRAINING = TASK_DEFINITIONS.filter((task) => task.phase === 'training');
const HELDOUT = TASK_DEFINITIONS.filter((task) => task.phase === 'heldout');

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
}

function windowsFor(tasks, campaignId) {
  return tasks.map((task) => ({ id: task.id, taskHash: fingerprint({ id: task.id,
    sourceHash: task.sourceHash, question: task.question }),
  contextHash: fingerprint({ campaignId, taskId: task.id, dimension: 'code_reasoning' }),
  dimension: 'code_reasoning', painExpected: task.phase === 'training' }));
}

function taskPrompt(task, notes) {
  const lesson = notes.length ? `Verified lessons from prior training windows:\n${notes.join('\n')}`
    : 'No prior verified lessons are available.';
  return ['You are answering a read-only code-comprehension benchmark about GenOS.',
    'Use only the source excerpt. Choose exactly one listed answer. Do not propose edits or execute tools.',
    `Source excerpt:\n${task.source}`, `Question: ${task.question}`,
    `Choices: ${task.choices.join(' | ')}`, lesson,
    'Return one JSON object with exactly one string property named "answer".'].join('\n\n');
}

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return '__invalid__';
  try {
    const value = JSON.parse(match[0]).answer;
    return typeof value === 'string' ? value.trim().toLowerCase() : '__invalid__';
  } catch (_) { return '__invalid__'; }
}

function pressure(history) {
  return endocrine.calculatePressure(history, []).developmentalPressure;
}

function modelAudit(options) {
  const { config, task, prompt, result, answer } = options;
  return { campaignId: config.campaignId, model: config.model, taskId: task.id,
    sourceHash: task.sourceHash, promptHash: fingerprint(prompt), responseHash: fingerprint(result.text || ''),
    answer, expected: task.expected, correct: answer === task.expected.toLowerCase() };
}

function makeAdapters(config, restored = []) {
  const state = { config, taskMap: new Map(config.tasks.map((task) => [task.id, task])),
    notes: { control: [], treatment: restored.map((task) => `Verified correction for ${task.id}: ${task.expected}.`) },
    painHistory: { control: [], treatment: restored.map(painRecord) }, pending: new Map(), audit: [] };
  return { runWindow: (input) => runQwenWindow(input, state),
    verifyWindow: (input) => verifyQwenWindow(input, state), audit: state.audit };
}

function painRecord() {
  return { dimension: 'code_reasoning', kind: 'capability_gap', epistemic_status: 'observed' };
}

async function runQwenWindow(input, state) {
  const { config, taskMap, notes, painHistory, pending, audit } = state;
  const task = taskMap.get(input.window.id);
  if (!task) throw new Error(`Unknown benchmark task ${input.window.id}`);
  const prompt = taskPrompt(task, input.arm === 'treatment' ? notes.treatment : []);
  const startedAt = Date.now();
  const response = await modelProvider.generate({ model: config.model, prompt,
    responseFormat: 'json_object', enforceSchema: false, stream: false,
    temperature: 0, maxTokens: 100, timeoutMs: 180000,
    organizationId: input.project.organizationId, projectId: input.project.projectId,
    agentId: input.project.entityId });
  const answer = parseAnswer(response.text);
  const record = modelAudit({ config, task, prompt, result: response, answer });
  const training = input.phase === 'training';
  const painObserved = training && !record.correct;
  const before = input.arm === 'treatment' ? pressure(painHistory.treatment) : null;
  const nextHistory = painObserved ? [...painHistory.treatment, painRecord()] : painHistory.treatment;
  const after = input.arm === 'treatment' ? pressure(nextHistory) : null;
  const painObservationHash = painObserved ? fingerprint({ taskId: task.id,
    sourceHash: task.sourceHash, answer, expected: task.expected }) : null;
  const outcome = makeOutcome({ config, input, task, record, prompt, response,
    painObserved, painObservationHash, before, after, training, startedAt });
  pending.set(input.idempotencyKey, { input, task, record, painObserved, nextHistory });
  audit.push(record);
  return outcome;
}

function makeOutcome(options) {
  const { config, input, task, record, prompt, response, painObserved,
    painObservationHash, before, after, training } = options;
  return { success: record.correct, projectId: input.project.projectId,
    actorId: config.model, regressions: record.correct ? 0 : 1, humanInterventions: 0,
    costUsd: 0, tokens: Math.ceil((prompt.length + String(response.text || '').length) / 4),
    durationMs: Date.now() - options.startedAt, painObserved, painObservationHash,
    developmentalPressureBefore: before, developmentalPressureAfter: after,
    progressResult: training ? 'not_tested' : 'inconclusive', clearanceApplied: false,
    clearanceEvidenceHash: null, contextHash: task.contextHash,
    artifactHash: fingerprint({ ...record, model: config.model }) };
}

async function verifyQwenWindow(input, state) {
  const { config, notes, painHistory, pending } = state;
  const record = pending.get(input.idempotencyKey);
  if (!validQwenOutcome(record, input, config)) throw new Error('Qwen oracle could not bind the run outcome.');
  if (shouldLearn(record)) {
    painHistory.treatment = record.nextHistory;
    notes.treatment.push(`Verified correction for ${record.task.id}: ${record.task.expected}.`);
  }
  const refs = [input.outcome.artifactHash, input.outcome.painObservationHash].filter(Boolean);
  pending.delete(input.idempotencyKey);
  return verifierReceipt(input, config, refs);
}

function validQwenOutcome(record, input, config) {
  return Boolean(record) && input.outcome.success === record.record.correct
    && input.outcome.painObserved === record.painObserved
    && input.outcome.artifactHash === fingerprint({ ...record.record, model: config.model });
}

function shouldLearn(record) {
  return record.input.arm === 'treatment' && record.input.phase === 'training'
    && record.painObserved;
}

function verifierReceipt(input, config, refs) {
  return { verified: true, verifierId: 'genos-qwen-source-oracle-v1',
    projectId: input.project.projectId, workspaceId: input.workspaceId,
    initialSnapshotHash: input.initialSnapshotHash, intervention: input.intervention,
    executionMode: 'protocol', artifactHash: input.outcome.artifactHash,
    outcomeHash: fingerprint(input.outcome), conditionsHash: input.conditionsHash,
    evidenceRefs: refs };
}

async function ensureModelAvailable(model) {
  const configuration = modelProvider.modelConfiguration(model);
  if (configuration.provider !== 'ollama') throw new Error('This driver requires a local Ollama Qwen model.');
  const tagsEndpoint = configuration.endpoint.replace(/\/api\/chat\/?$/i, '/api/tags');
  const response = await fetch(tagsEndpoint);
  if (!response.ok) throw new Error(`Ollama model discovery failed with HTTP ${response.status}.`);
  const models = (await response.json()).models || [];
  if (!models.some((entry) => entry.name === configuration.modelName)) {
    throw new Error(`Required Qwen model is not installed: ${configuration.modelName}`);
  }
  return configuration.modelName;
}

async function openCampaignDb(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = await open({ filename, driver: sqlite3.Database });
  await migrateGvxLedger(db);
  return db;
}

function campaignCoordinator(campaignId) {
  return { organizationId: 'genos-local', projectId: `${campaignId}-coordinator`,
    entityId: 'qwen-campaign-runner' };
}

function campaignManifest(config, startedAt) {
  const coordinator = campaignCoordinator(config.campaignId);
  const arm = (name) => ({ scope: { organizationId: 'genos-local',
    projectId: `${config.campaignId}-${name}`, entityId: `qwen-${name}` },
  workspaceId: `${config.campaignId}-${name}-readonly`,
  intervention: name === 'control' ? 'baseline' : 'full_arc',
  initialSnapshotHash: config.sourceSnapshotHash, modelLock: config.model,
  toolsLock: 'readonly-genos-source-qa-v1', permissionsHash: fingerprint('readonly-only'),
  budget: { costUsd: 1, tokens: 4096, seconds: 180 } });
  const tasks = config.tasks;
  return campaign.createManifest({ campaignId: config.campaignId, mode: 'protocol', coordinator, startedAt,
    arms: { control: arm('control'), treatment: arm('treatment') },
    trainingWindows: windowsFor(tasks.filter((item) => TRAINING.some((entry) => entry.id === item.id)), config.campaignId),
    heldoutWindows: windowsFor(tasks.filter((item) => HELDOUT.some((entry) => entry.id === item.id)), config.campaignId),
    thresholds: { minSuccessDelta: 0.1, minPainEpisodes: 3,
      minHumanInterventionReduction: 0, minConfirmedHeldout: 2 } });
}

async function restoreTreatmentMemory(db, manifest, tasks) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const events = await ledger.listAllEvents(db, manifest.arms.treatment.scope);
  const painRuns = events.filter((event) => event.payload?.kind === 'shev_developmental_run'
    && event.payload.campaignId === manifest.campaignId && event.payload.phase === 'training'
    && event.payload.outcome?.painObserved === true);
  return painRuns.flatMap((event) => {
    const task = taskMap.get(event.payload.windowId);
    return task ? [task] : [];
  });
}

async function savedManifest(db, manifest) {
  const events = await ledger.listAllEvents(db, manifest.coordinator);
  const existing = events.find((event) => event.payload?.kind === 'shev_developmental_manifest'
    && event.payload.manifest?.campaignId === manifest.campaignId);
  if (!existing) return manifest;
  if (existing.payload.manifest.manifestHash !== manifest.manifestHash) {
    throw new Error('Campaign id is already registered with different source/model locks.');
  }
  return existing.payload.manifest;
}

async function existingCampaignManifest(db, campaignId) {
  const events = await ledger.listAllEvents(db, campaignCoordinator(campaignId));
  return events.find((event) => event.payload?.kind === 'shev_developmental_manifest'
    && event.payload.manifest?.campaignId === campaignId)?.payload.manifest || null;
}

async function main() {
  const args = process.argv.slice(2);
  const database = option(args, 'db', process.env.GENOS_SHEV_QWEN_DB);
  if (!database) throw new Error('Pass --db or GENOS_SHEV_QWEN_DB (use a disposable local database).');
  const model = option(args, 'model', process.env.GENOS_QWEN_MODEL || 'ollama://qwen2.5-coder:7b');
  const modelName = await ensureModelAvailable(model);
  const source = taskSet();
  const campaignId = option(args, 'campaign-id', `qwen-shev-${Date.now()}`);
  const config = { ...source, model, modelName, campaignId };
  const db = await openCampaignDb(path.resolve(database));
  try {
    const previous = await existingCampaignManifest(db, campaignId);
    const manifest = await savedManifest(db, campaignManifest(config, previous?.startedAt));
    const restored = await restoreTreatmentMemory(db, manifest, config.tasks);
    const adapters = makeAdapters(config, restored);
    const report = await campaign.runCampaign({ db, manifest,
      runWindow: adapters.runWindow, verifyWindow: adapters.verifyWindow });
    process.stdout.write(`${JSON.stringify({ report, qwenAudit: adapters.audit }, null, 2)}\n`);
  } finally { await db.close(); }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
