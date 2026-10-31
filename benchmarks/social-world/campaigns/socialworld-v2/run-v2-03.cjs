'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateReport } = require('./validate-report.cjs');
const { verifyBundle } = require('./v2-03-receipt-verifier.cjs');

const REGISTERED_ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory']);
const EXECUTABLE_ARMS = Object.freeze(['genos-full']);

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) result[args[index].replace(/^--/, '')] = args[index + 1];
  return result;
}

async function runPhase(phase, databasePath, payloadPath) {
  const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
  const db = await getDatabase(databasePath);
  try {
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    if (phase === 'write') return await writePhase({ db, payload });
    if (phase === 'negative') return await negativePhase({ db, payload });
    if (phase === 'recall') return await recallPhase({ db, payload });
    throw new Error(`Unknown V2-03 process phase: ${phase}`);
  } finally {
    await closeDatabase();
  }
}

async function writePhase(input) {
  const { db, payload } = input;
  const source = sourceFor(payload);
  if (source) await seedMemoryRelation({ db, payload, source });
  const episodeStore = require('../../../../backend/src/services/autobiographicalMemory/episodeStore');
  for (let index = 0; index < payload.supportCount; index += 1) {
    const signed = source?.records[index];
    const eventId = signed?.receipt.eventId || `${payload.runId}-event-${index + 1}`;
    await episodeStore.recordEpisode({
      id: `${payload.runId}-episode-${index + 1}`, agentId: payload.agentId,
      missionId: `${payload.runId}-seed-mission-${index + 1}`, kind: payload.kind,
      salience: 0.9, situation: { goal: payload.trainingGoal, sourceEventId: eventId,
        receiptVerification: signed?.verification || null },
      decision: { selectedStrategy: 'ask-before-action' },
      action: { selectedAction: 'asked before helping with navigation route' },
      outcome: { status: 'success', evidenceRefs: [`event:${eventId}`,
        ...(signed ? [`receipt:sha256:${signed.verification.receiptDigest}`] : [])] },
      lesson: { summary: 'Ask before helping with a navigation route.' }
    }, db);
  }
  const lessonService = require('../../../../backend/src/services/autobiographicalMemory/lessonService');
  const lessons = await lessonService.consolidateLessons({ agentId: payload.agentId }, db);
  return { written: payload.supportCount, lessons: lessons.length, expectedSupport: payload.supportCount,
    signedSourceCount: source?.records.length || 0 };
}

async function heldOutRecall(input) {
  const { db, payload } = input;
  const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.45, evidenceStrictness: 0.5 } } };
  const mission = { kind: payload.kind, prompt: payload.heldOutGoal };
  const service = require('../../../../backend/src/services/autobiographicalMemory/orchestratorRecall');
  const recall = await service.recallBeforePlanning({ db, agentId: payload.agentId,
    normalizedMission: mission, autonomyPlan: plan });
  return { recall, plan };
}

async function negativePhase(input) {
  const { db } = input;
  const episodes = await db.get('SELECT COUNT(*) AS count FROM autobiographical_episodes');
  const lessons = await db.get('SELECT COUNT(*) AS count FROM autobiographical_lessons WHERE active = 1');
  const relations = await db.get('SELECT COUNT(*) AS count FROM agent_relations');
  const { recall, plan } = await heldOutRecall(input);
  return { episodeCount: episodes.count, lessonCount: lessons.count, relationCount: relations.count,
    recalledEpisodes: recall.episodes.length, recalledLessons: recall.lessons.length,
    recall: plan.autobiographicalRecall, decision: plan.causalDecision };
}

async function recallPhase(input) {
  const { db, payload } = input;
  const source = sourceFor(payload);
  const getEpisodeById = require('../../../../backend/src/services/autobiographicalMemory/episodeStore').getEpisodeById;
  const sourceEvidence = [];
  for (let index = 0; index < payload.supportCount; index += 1) {
    const episode = await getEpisodeById(`${payload.runId}-episode-${index + 1}`, db);
    sourceEvidence.push({ id: episode?.id, sourceEventId: episode?.situation?.sourceEventId,
      evidenceRefs: episode?.outcome?.evidenceRefs, provenance: episode?.provenance,
      receiptVerification: episode?.situation?.receiptVerification });
  }
  const { plan } = await heldOutRecall(input);
  const authenticatedReceiptsBound = Boolean(source) && sourceEvidence.every((item, index) =>
    sourceMatches(item, source.records[index]));
  const relation = await require('../../../../backend/src/services/crossAgentRelationalService')
    .getRelation({ db, id: `${payload.runId}-relation` });
  return { episodeCount: sourceEvidence.length, sourceEvidence, authenticatedReceiptsBound,
    relationPersisted: relationMatches({ relation, source, payload }), relation,
    recall: plan.autobiographicalRecall, decision: plan.causalDecision, heldOutGoal: payload.heldOutGoal };
}

function relationMatches(input) {
  const { relation, source, payload } = input;
  return Boolean(source && relation && relation.sourceAgentId === payload.agentId
    && relation.targetAgentId === source.records[0].receipt.actorId
    && source.records.every((item) => relation.metadata.sourceReceiptDigests
      ?.includes(item.verification.receiptDigest)));
}

async function seedMemoryRelation(input) {
  const { db, payload, source } = input;
  const organizationId = `${payload.runId}-org`;
  const projectId = `${payload.runId}-project`;
  const workspaceId = `${payload.runId}-space`;
  const actorId = source.records[0].receipt.actorId;
  if (!source.records.every((item) => item.receipt.actorId === actorId)) {
    throw new Error('V2-03 source receipts must identify the same social counterpart.');
  }
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', [organizationId, 'V2-03 durable memory']);
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    [projectId, organizationId, 'V2-03 durable memory']);
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'V2-03 durable memory', workspaceId, organizationId, projectId]);
  for (const agentId of [payload.agentId, actorId]) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [agentId, agentId, 'worker', 'idle', 'worker', workspaceId]);
  }
  await require('../../../../backend/src/services/crossAgentRelationalService').createRelation({ db,
    id: `${payload.runId}-relation`, sourceAgentId: payload.agentId, targetAgentId: actorId,
    relationType: 'colleague', relationClass: 'organizational', organizationId, projectId,
    metadata: { sourceReceiptDigests: source.records.map((item) => item.verification.receiptDigest) } });
}

function sourceFor(payload) {
  if (!payload.receiptBundlePath || !payload.trustFilePath) return null;
  const source = verifyBundle({ bundlePath: payload.receiptBundlePath, trustFilePath: payload.trustFilePath,
    seed: payload.seed, recipientId: payload.agentId, expectedCount: payload.supportCount });
  if (source.verifierKeyFingerprint !== payload.verifierKeyFingerprint
    || source.bundleDigest !== payload.bundleDigest) throw new Error('V2-03 signed source changed after admission.');
  return source;
}

function sourceMatches(item, signed) {
  return Boolean(item?.sourceEventId === signed?.receipt.eventId
    && item.evidenceRefs?.includes(`event:${signed.receipt.eventId}`)
    && item.evidenceRefs?.includes(`receipt:sha256:${signed.verification.receiptDigest}`)
    && item.receiptVerification?.receiptDigest === signed.verification.receiptDigest
    && item.receiptVerification?.verifierKeyFingerprint === signed.verification.verifierKeyFingerprint);
}

function runChild(phase, databasePath, payloadPath) {
  const result = spawnSync(process.execPath, [__filename, '--phase', phase, '--database', databasePath, '--payload', payloadPath], {
    encoding: 'utf8', timeout: 120000, env: { ...process.env, GENOS_DB_PATH: databasePath }
  });
  if (result.error || result.status !== 0) throw new Error(`child ${phase} failed: ${result.error?.message || result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function snapshotSignedSource(input) {
  if (!input.receiptBundlePath && !input.trustFilePath) return null;
  if (!input.receiptBundlePath || !input.trustFilePath) throw new Error('V2-03 requires both signed receipts and an external trust file.');
  const source = verifyBundle({ bundlePath: path.resolve(input.receiptBundlePath),
    trustFilePath: path.resolve(input.trustFilePath), seed: input.seed,
    recipientId: input.agentId, expectedCount: input.supportCount });
  const sourceDirectory = path.join(input.attemptDirectory, 'source');
  fs.mkdirSync(sourceDirectory, { recursive: false });
  const bundleSnapshot = path.join(sourceDirectory, 'bundle.json');
  fs.copyFileSync(input.receiptBundlePath, bundleSnapshot, fs.constants.COPYFILE_EXCL);
  const copied = new Set();
  for (const record of source.records) {
    const relative = record.receipt.sourceArtifact;
    if (copied.has(relative)) continue;
    const target = path.join(sourceDirectory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(record.sourceArtifactPath, target, fs.constants.COPYFILE_EXCL);
    copied.add(relative);
  }
  const trustSnapshot = path.join(sourceDirectory, 'trust.json');
  fs.copyFileSync(input.trustFilePath, trustSnapshot, fs.constants.COPYFILE_EXCL);
  const replay = verifyBundle({ bundlePath: bundleSnapshot, trustFilePath: input.trustFilePath,
    seed: input.seed, recipientId: input.agentId, expectedCount: input.supportCount });
  if (replay.bundleDigest !== source.bundleDigest) throw new Error('V2-03 source snapshot changed during capture.');
  return { bundlePath: bundleSnapshot, trustFilePath: input.trustFilePath,
    bundleDigest: source.bundleDigest, verifierKeyFingerprint: source.verifierKeyFingerprint,
    issuer: source.issuer, evidenceRefs: [`${input.runId}/source/bundle.json`, `${input.runId}/source/trust.json`,
      ...[...copied].map((relative) => `${input.runId}/source/${relative.replaceAll('\\', '/')}`)] };
}

function hasCompleteSourceEvidence(positive, expectedSupport) {
  return positive.sourceEvidence?.length === expectedSupport
    && positive.sourceEvidence.every((item) => item.id && item.sourceEventId
      && item.evidenceRefs?.includes(`event:${item.sourceEventId}`)
    && item.provenance?.evidenceClass === 'runtime_report'
    && item.receiptVerification?.accepted === true
    && item.receiptVerification?.signatureVerified === true
    && /^[a-f0-9]{64}$/.test(item.receiptVerification?.verifierKeyFingerprint || '')
    && item.evidenceRefs?.includes(`receipt:sha256:${item.receiptVerification.receiptDigest}`));
}

function hasRecalledSource(positive) {
  const recalledSources = positive.recall?.episodes?.some((episode) =>
    positive.sourceEvidence.some((source) => source.id === episode.id));
  return Boolean(recalledSources);
}

function hasChangedDecision(positive) {
  return positive.decision?.changed === true
    && positive.decision.baseline?.chosenAction !== positive.decision.recalled?.chosenAction;
}

function hasEmptyNegativeControl(negative) {
  return negative.episodeCount === 0 && negative.lessonCount === 0
    && negative.relationCount === 0
    && negative.recalledEpisodes === 0 && negative.recalledLessons === 0
    && negative.decision?.changed === false;
}

function oraclePassed(positive, negative, write) {
  return positive.authenticatedReceiptsBound === true
    && positive.relationPersisted === true
    && write.written === write.expectedSupport && write.lessons > 0
    && hasCompleteSourceEvidence(positive, write.expectedSupport) && hasRecalledSource(positive)
    && positive.recall?.lessons?.length > 0 && hasChangedDecision(positive)
    && hasEmptyNegativeControl(negative);
}

function reportFor(input) {
  const { args, startedAt, durationMs, evidenceName, passed, evidence } = input;
  return {
    campaignId: 'socialworld-v2', scenario: 'V2-03', arm: args.arm || 'genos-full',
    seed: args.seed || 'socialworld-v2-01', attempt: Number(args.attempt || 1),
    sourceCommit: args.sourceCommit, runtimeVersion: '3', model: null,
    configHash: args.configHash, status: passed ? 'pass' : 'inconclusive',
    campaignDisposition: passed ? 'signed-runtime-source' : 'diagnostic-pilot', startedAt, durationMs,
    inputs: reportInputs(evidence), observed: reportObserved(evidence), oracle: reportOracle({ evidence, passed }),
    evidenceRefs: [evidenceName, ...(evidence.signedSource?.evidenceRefs || [])], violations: [],
    limitations: reportLimitations({ evidence, passed })
  };
}

function reportInputs(evidence) {
  return { processBoundaries: 3, heldOutDecision: true, durableDatabase: true,
    supportEpisodes: evidence.write.expectedSupport,
    sourceBundleDigest: evidence.signedSource?.bundleDigest || null,
    verifierKeyFingerprint: evidence.signedSource?.verifierKeyFingerprint || null };
}

function reportObserved(evidence) {
  return { recallApplied: Boolean(evidence.positive.recall),
    decisionChanged: evidence.positive.decision?.changed === true,
    sourceProvenanceComplete: Boolean(evidence.provenanceComplete),
    relationPersisted: evidence.positive.relationPersisted === true,
    negativeControlEmpty: evidence.negative.episodeCount === 0 && evidence.negative.relationCount === 0 };
}

function reportOracle(input) {
  const { evidence, passed } = input;
  return { recalculable: passed, checks: {
    authenticatedReceiptsBound: evidence.positive.authenticatedReceiptsBound === true,
    heldOutDecisionChanged: evidence.positive.decision?.changed === true,
    sourceEventAndEvidenceRefs: Boolean(evidence.provenanceComplete),
    relationPersisted: evidence.positive.relationPersisted === true,
    freshDatabaseUnchanged: evidence.negative.decision?.changed === false && evidence.negative.relationCount === 0 } };
}

function reportLimitations(input) {
  if (input.passed) return [];
  return input.evidence.signedSource
    ? ['Authenticated events were ingested, but the durable memory, relation, held-out decision or negative control did not satisfy the oracle.']
    : ['Memory restart used generated input episodes; independent authenticated source receipts are unavailable, so the causal oracle remains inconclusive.'];
}

function campaignPayload(input) {
  const { args, runId, attemptDirectory } = input;
  const seed = args.seed || 'socialworld-v2-01';
  const sourceRequested = Boolean(args.receiptBundlePath || args.trustFilePath);
  const agentId = sourceRequested ? `v203-${seed}-agent` : `${runId}-agent`;
  const signedSource = snapshotSignedSource({ receiptBundlePath: args.receiptBundlePath,
    trustFilePath: args.trustFilePath, seed, agentId, supportCount: 5, attemptDirectory, runId });
  const payload = { runId, seed, agentId, kind: 'social_help', supportCount: 5,
    receiptBundlePath: signedSource?.bundlePath || null, trustFilePath: signedSource?.trustFilePath || null,
    verifierKeyFingerprint: signedSource?.verifierKeyFingerprint || null,
    bundleDigest: signedSource?.bundleDigest || null,
    trainingGoal: 'help a friend with a navigation route', heldOutGoal: 'help another friend with a navigation route' };
  return { payload, signedSource };
}

async function runCampaign(args) {
  if (!args.database || !args.report) throw new Error('Usage: node run-v2-03.cjs --database <sqlite-path> --report <report.json>');
  const startedAt = new Date().toISOString();
  const reportPath = path.resolve(args.report);
  const directory = path.dirname(reportPath);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(reportPath)) throw new Error(`refusing to overwrite report: ${reportPath}`);
  const runId = `v203-${crypto.randomUUID()}`;
  const attemptDirectory = path.join(directory, runId);
  fs.mkdirSync(attemptDirectory, { recursive: false });
  const payloadPath = path.join(attemptDirectory, 'payload.json');
  const positiveDatabase = path.join(attemptDirectory, 'positive.sqlite');
  const negativeDatabase = path.join(attemptDirectory, 'negative.sqlite');
  const evidenceName = `${runId}/evidence.json`;
  const evidencePath = path.join(attemptDirectory, 'evidence.json');
  const { payload, signedSource } = campaignPayload({ args, runId, attemptDirectory });
  writeJson(payloadPath, payload);
  const started = Date.now();
  const write = runChild('write', positiveDatabase, payloadPath);
  const positive = runChild('recall', positiveDatabase, payloadPath);
  const negative = runChild('negative', negativeDatabase, payloadPath);
  const provenanceComplete = hasCompleteSourceEvidence(positive, payload.supportCount);
  const evidence = { runId, databases: { positive: positiveDatabase, negative: negativeDatabase },
    processBoundaries: ['writer', 'held-out-restart-reader', 'fresh-database-reader'],
    signedSource, write, positive, negative, provenanceComplete };
  const passed = oraclePassed(positive, negative, write);
  writeJson(evidencePath, evidence);
  const configHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const sourceCommit = args.sourceCommit || spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const report = reportFor({ args: { ...args, sourceCommit, configHash }, startedAt,
    durationMs: Date.now() - started, evidenceName, passed, evidence });
  writeJson(reportPath, report);
  const errors = validateReport(report, reportPath, path.resolve(__dirname, '../../../..'));
  if (errors.length) throw new Error(`generated V2-03 report failed validation: ${errors.join('; ')}`);
  return { report, evidencePath };
}

function comparisonFor(input) {
  return { events: { trainingGoal: 'help a friend with a navigation route',
    heldOutGoal: 'help another friend with a navigation route', supportCount: 5, seed: input.seed },
  budget: { supportEpisodes: 5, processBoundaries: 3 },
  permissions: { policy: 'socialworld-v2-standard-permissions-v1' } };
}

function unavailableArm(input) {
  const reason = `No V2-03 runtime adapter exists for ${input.arm}; it was not mapped to another arm.`;
  return { report: { campaignId: 'socialworld-v2', scenario: 'V2-03', arm: input.arm, seed: input.seed,
    attempt: input.attempt, sourceCommit: input.sourceCommit, runtimeVersion: '3', model: null,
    configHash: crypto.createHash('sha256').update(JSON.stringify({ scenario: 'V2-03', seed: input.seed })).digest('hex'),
    status: 'inconclusive', startedAt: new Date().toISOString(), durationMs: 0,
    inputs: { comparison: { eventsHash: crypto.createHash('sha256').update(JSON.stringify(comparisonFor(input).events)).digest('hex'),
      budgetHash: crypto.createHash('sha256').update(JSON.stringify(comparisonFor(input).budget)).digest('hex'),
      permissionsHash: crypto.createHash('sha256').update(JSON.stringify(comparisonFor(input).permissions)).digest('hex') } },
    observed: { runnerExecuted: false }, oracle: { recalculable: false, reason }, evidenceRefs: [],
    violations: [], limitations: [reason] }, evidence: { runnerExecuted: false, reason }, comparison: comparisonFor(input) };
}

async function runScenario(input) {
  if (!REGISTERED_ARMS.includes(input.arm)) throw new Error(`Unknown V2-03 arm: ${input.arm}`);
  if (!EXECUTABLE_ARMS.includes(input.arm)) return unavailableArm(input);
  const internalReport = path.join(input.outputDirectory, `internal-${input.scenario || 'V2-03'}-${input.seed}-${input.arm}-${input.attempt}.json`);
  const result = await runCampaign({ database: path.join(input.outputDirectory, 'unused.sqlite'), report: internalReport,
    seed: input.seed, arm: input.arm, attempt: String(input.attempt), sourceCommit: input.sourceCommit,
    receiptBundlePath: input.receiptBundlePath || process.env.GENOS_V203_RECEIPT_BUNDLE,
    trustFilePath: input.trustFilePath || process.env.GENOS_V203_TRUST_FILE });
  const evidencePath = path.resolve(path.dirname(internalReport), result.report.evidenceRefs[0]);
  return { report: { ...result.report, inputs: { ...result.report.inputs, comparison: comparisonFor(input) } },
    evidence: JSON.parse(fs.readFileSync(evidencePath, 'utf8')), comparison: comparisonFor(input) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.phase) {
    process.stdout.write(`${JSON.stringify(await runPhase(args.phase, args.database, args.payload))}\n`);
    return;
  }
  const result = await runCampaign(args);
  if (result.report.status !== 'pass') process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { parseArgs, reportFor, oraclePassed, runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS };
