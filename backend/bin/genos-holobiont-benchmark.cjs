'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ARMS } = require('../src/services/holobionte/benchmark/longitudinalBenchmarkService');
const { runLongitudinalBenchmark } = require('../src/services/holobionte/benchmark/longitudinalBenchmarkService');
const provider = require('../src/services/holobionte/benchmark/campaignAdapterProvider');

function argument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw Object.assign(new Error(`Missing ${name}.`), { code: 'HOLOBIONT_BENCHMARK_ARGUMENT_REQUIRED' });
  }
  return args[index + 1];
}

function validateBudget(budget) {
  for (const key of ['maxCost', 'maxTokens', 'maxTimeMs']) {
    if (!Number.isFinite(budget?.[key]) || budget[key] <= 0) {
      throw Object.assign(new Error(`Manifest budget.${key} must be positive.`), { code: 'HOLOBIONT_BENCHMARK_BUDGET_REQUIRED' });
    }
  }
  if (budget.maxTimeMs > 2147483647) {
    throw Object.assign(new Error('Manifest budget.maxTimeMs exceeds the supported timer range.'), { code: 'HOLOBIONT_BENCHMARK_BUDGET_INVALID' });
  }
  return budget;
}

function appendJournal(file, row) {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', flag: 'a' });
}

function startJournal(file, header) {
  fs.writeFileSync(file, `${JSON.stringify(header)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function journalError(message, code) { return Object.assign(new Error(message), { code }); }

function readRows(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function assertJournalHeader(rows, expected) {
  const header = rows[0];
  const mismatch = Object.keys(expected).some((key) => JSON.stringify(header?.[key]) !== JSON.stringify(expected[key]));
  if (!header || header.type !== 'campaign' || mismatch) {
    throw Object.assign(new Error('Journal does not match this campaign configuration.'), { code: 'HOLOBIONT_BENCHMARK_JOURNAL_MISMATCH' });
  }
  if (rows.some((row) => row.type === 'completed')) {
    throw journalError('Journal already contains a completed campaign.', 'HOLOBIONT_BENCHMARK_ALREADY_COMPLETED');
  }
  if (!Number.isFinite(Date.parse(header.startedAt)) || !Array.isArray(expected.missionIds)) {
    throw journalError('Journal header is incomplete.', 'HOLOBIONT_BENCHMARK_JOURNAL_INVALID');
  }
}

function collectResumeRuns(rows, missionIds) {
  const resumeRuns = Object.fromEntries(ARMS.map((arm) => [arm, {}]));
  let next = 0;
  for (const row of rows.slice(1).filter((entry) => entry.type === 'run')) {
    const sequence = missionIds.indexOf(row.result?.missionId);
    const expectedArm = ARMS[Math.floor(next / missionIds.length)];
    const expectedSequence = next % missionIds.length;
    if (!resumeRuns[row.arm] || sequence < 0 || sequence !== row.sequence
      || row.arm !== expectedArm || sequence !== expectedSequence) {
      throw journalError('Journal contains an invalid or duplicate run.', 'HOLOBIONT_BENCHMARK_JOURNAL_INVALID');
    }
    resumeRuns[row.arm][row.result.missionId] = row.result;
    next += 1;
  }
  return resumeRuns;
}

function loadJournal(file, expected, resume) {
  if (!fs.existsSync(file)) {
    if (resume) throw journalError('Resume journal is missing.', 'HOLOBIONT_BENCHMARK_JOURNAL_MISSING');
    startJournal(file, { type: 'campaign', ...expected, startedAt: new Date().toISOString() });
    return { resumeRuns: {}, elapsedBeforeResume: 0 };
  }
  if (!resume) throw journalError('Journal already exists; pass --resume to continue it.', 'HOLOBIONT_BENCHMARK_JOURNAL_EXISTS');
  const rows = readRows(file);
  assertJournalHeader(rows, expected);
  const header = rows[0];
  return { resumeRuns: collectResumeRuns(rows, expected.missionIds),
    elapsedBeforeResume: Math.max(0, Date.now() - Date.parse(header.startedAt)) };
}

function writeReport(file, report) {
  if (fs.existsSync(file)) {
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    const same = previous.benchmarkId === report.benchmarkId
      && previous.manifestSha256 === report.manifestSha256
      && previous.adapterSha256 === report.adapterSha256
      && JSON.stringify(previous.report) === JSON.stringify(report.report);
    if (!same) throw journalError('Existing report disagrees with the journal.', 'HOLOBIONT_BENCHMARK_REPORT_MISMATCH');
    return;
  }
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

async function executeCampaign(args) {
  const manifestPath = argument(args, '--manifest');
  const outputPath = path.resolve(argument(args, '--output'));
  const journalPath = path.resolve(argument(args, '--journal'));
  if (outputPath === journalPath) throw journalError('Report and journal paths must differ.', 'HOLOBIONT_BENCHMARK_PATHS_COLLIDE');
  const resume = args.includes('--resume');
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  let deadline = null;
  try {
    const campaign = await provider.createConfiguredCampaign({ manifestPath, signal: controller.signal });
    const budget = validateBudget(campaign.manifest.budget);
    if (!campaign.benchmarkId) throw Object.assign(new Error('Manifest benchmarkId is required.'), { code: 'HOLOBIONT_BENCHMARK_ID_REQUIRED' });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    const journalState = loadJournal(journalPath, {
      benchmarkId: campaign.benchmarkId, manifestSha256: campaign.manifestSha256,
      adapterSha256: campaign.adapterSha256, budget,
      missionIds: campaign.missions.map((mission) => String(mission.id || mission.missionId))
    }, resume);
    const remainingTime = budget.maxTimeMs - journalState.elapsedBeforeResume;
    if (remainingTime <= 0) controller.abort();
    else deadline = setTimeout(abort, remainingTime);
    const header = JSON.parse(fs.readFileSync(journalPath, 'utf8').split(/\r?\n/, 1)[0]);
    const report = await runLongitudinalBenchmark({
      benchmarkId: campaign.benchmarkId,
      missions: campaign.missions,
      runMission: ({ arm, mission, sequence, remainingBudget }) => campaign.armAdapters[arm]({
        arm, mission, sequence, remainingBudget, signal: controller.signal, benchmarkId: campaign.benchmarkId
      }),
      requireRuntimeReceipt: true,
      signal: controller.signal,
      budget,
      resumeRuns: journalState.resumeRuns,
      elapsedBeforeResume: journalState.elapsedBeforeResume,
      onRun: (entry) => appendJournal(journalPath, { type: 'run', ...entry, recordedAt: new Date().toISOString() })
    });
    writeReport(outputPath, {
      schema: 'genos.holobiont.longitudinal-benchmark/v1', status: 'completed',
      startedAt: header.startedAt, completedAt: new Date().toISOString(),
      benchmarkId: campaign.benchmarkId,
      manifestSha256: campaign.manifestSha256,
      adapterSha256: campaign.adapterSha256,
      adapterPath: campaign.adapterPath,
      journalPath,
      budget,
      report
    });
    appendJournal(journalPath, { type: 'completed', completedAt: new Date().toISOString() });
    process.stdout.write(`${JSON.stringify({ status: 'completed', benchmarkId: campaign.benchmarkId, missions: report.missionCount, runs: report.missionCount * 12, outputPath, journalPath })}\n`);
  } finally {
    if (deadline) clearTimeout(deadline);
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

executeCampaign(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`Holobiont benchmark failed: ${error.code || 'HOLOBIONT_BENCHMARK_FAILED'}\n`);
  process.exitCode = 1;
});
