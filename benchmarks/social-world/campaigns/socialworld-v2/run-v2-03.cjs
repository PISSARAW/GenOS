'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateReport } = require('./validate-report.cjs');

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
    if (phase === 'write') {
      const episodeStore = require('../../../../backend/src/services/autobiographicalMemory/episodeStore');
      const lessonService = require('../../../../backend/src/services/autobiographicalMemory/lessonService');
      for (let index = 0; index < payload.supportCount; index += 1) {
        const eventId = `${payload.runId}-event-${index + 1}`;
        await episodeStore.recordEpisode({
          id: `${payload.runId}-episode-${index + 1}`, agentId: payload.agentId,
          missionId: `${payload.runId}-seed-mission-${index + 1}`, kind: payload.kind,
          salience: 0.9, situation: { goal: payload.trainingGoal, sourceEventId: eventId },
          decision: { selectedStrategy: 'ask-before-action' },
          action: { selectedAction: 'asked before helping with navigation route' },
          outcome: { status: 'success', evidenceRefs: [`event:${eventId}`] },
          lesson: { summary: 'Ask before helping with a navigation route.' }
        }, db);
      }
      const lessons = await lessonService.consolidateLessons({ agentId: payload.agentId }, db);
      return { written: payload.supportCount, lessons: lessons.length, expectedSupport: payload.supportCount };
    }
    const { getEpisodeById } = require('../../../../backend/src/services/autobiographicalMemory/episodeStore');
    const { recallBeforePlanning } = require('../../../../backend/src/services/autobiographicalMemory/orchestratorRecall');
    if (phase === 'negative') {
      const recalls = await db.get('SELECT COUNT(*) AS count FROM autobiographical_episodes');
      const lessons = await db.get('SELECT COUNT(*) AS count FROM autobiographical_lessons WHERE active = 1');
      const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.45, evidenceStrictness: 0.5 } } };
      const mission = { kind: payload.kind, prompt: payload.heldOutGoal };
      const recall = await recallBeforePlanning({ db, agentId: payload.agentId, normalizedMission: mission, autonomyPlan: plan });
      return { episodeCount: recalls.count, lessonCount: lessons.count, recalledEpisodes: recall.episodes.length,
        recalledLessons: recall.lessons.length, recall: plan.autobiographicalRecall, decision: plan.causalDecision };
    }
    const sourceEvidence = [];
    for (let index = 0; index < payload.supportCount; index += 1) {
      const episode = await getEpisodeById(`${payload.runId}-episode-${index + 1}`, db);
      sourceEvidence.push({ id: episode?.id, sourceEventId: episode?.situation?.sourceEventId,
        evidenceRefs: episode?.outcome?.evidenceRefs, provenance: episode?.provenance });
    }
    const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.45, evidenceStrictness: 0.5 } } };
    const mission = { kind: payload.kind, prompt: payload.heldOutGoal };
    const recall = await recallBeforePlanning({ db, agentId: payload.agentId, normalizedMission: mission, autonomyPlan: plan });
    return { episodeCount: sourceEvidence.length, sourceEvidence, recall: plan.autobiographicalRecall,
      decision: plan.causalDecision, heldOutGoal: payload.heldOutGoal };
  } finally {
    await closeDatabase();
  }
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

function hasCompleteSourceEvidence(positive, expectedSupport) {
  return positive.sourceEvidence?.length === expectedSupport
    && positive.sourceEvidence.every((item) => item.id && item.sourceEventId
      && item.evidenceRefs?.includes(`event:${item.sourceEventId}`)
      && item.provenance?.evidenceClass === 'runtime_report');
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
    && negative.recalledEpisodes === 0 && negative.recalledLessons === 0
    && negative.decision?.changed === false;
}

function oraclePassed(positive, negative, write) {
  return write.written === write.expectedSupport && write.lessons > 0
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
    configHash: args.configHash, status: passed ? 'pass' : 'inconclusive', startedAt, durationMs,
    inputs: { processBoundaries: 3, heldOutDecision: true, durableDatabase: true, supportEpisodes: evidence.write.expectedSupport },
    observed: { recallApplied: Boolean(evidence.positive.recall), decisionChanged: evidence.positive.decision?.changed === true,
      sourceProvenanceComplete: Boolean(evidence.provenanceComplete), negativeControlEmpty: evidence.negative.episodeCount === 0 },
    oracle: { recalculable: passed, checks: { heldOutDecisionChanged: evidence.positive.decision?.changed === true,
      sourceEventAndEvidenceRefs: Boolean(evidence.provenanceComplete), freshDatabaseUnchanged: evidence.negative.decision?.changed === false } },
    evidenceRefs: [evidenceName], violations: [], limitations: passed ? [] : ['Required decision, recall, or source provenance evidence is missing.']
  };
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
  const payload = { runId, agentId: `${runId}-agent`, kind: 'social_help', supportCount: 5,
    trainingGoal: 'help a friend with a navigation route', heldOutGoal: 'help another friend with a navigation route' };
  writeJson(payloadPath, payload);
  const started = Date.now();
  const write = runChild('write', positiveDatabase, payloadPath);
  const positive = runChild('recall', positiveDatabase, payloadPath);
  const negative = runChild('negative', negativeDatabase, payloadPath);
  const provenanceComplete = positive.sourceEvidence?.length === payload.supportCount
    && positive.sourceEvidence.every((item) => item.sourceEventId && item.evidenceRefs?.includes(`event:${item.sourceEventId}`)
      && item.provenance?.evidenceClass === 'runtime_report');
  const evidence = { runId, databases: { positive: positiveDatabase, negative: negativeDatabase }, processBoundaries: ['writer', 'held-out-restart-reader', 'fresh-database-reader'], write, positive, negative, provenanceComplete };
  const passed = oraclePassed(positive, negative, write);
  writeJson(evidencePath, evidence);
  fs.rmSync(payloadPath, { force: true });
  const configHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const sourceCommit = args.sourceCommit || spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const report = reportFor({ args: { ...args, sourceCommit, configHash }, startedAt,
    durationMs: Date.now() - started, evidenceName, passed, evidence });
  writeJson(reportPath, report);
  const errors = validateReport(report, reportPath, path.resolve(__dirname, '../../../..'));
  if (errors.length) throw new Error(`generated V2-03 report failed validation: ${errors.join('; ')}`);
  if (!passed) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.phase) {
    process.stdout.write(`${JSON.stringify(await runPhase(args.phase, args.database, args.payload))}\n`);
    return;
  }
  await runCampaign(args);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { parseArgs, reportFor, oraclePassed };
