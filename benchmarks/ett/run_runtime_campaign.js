#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const runtime = require('./scenarios/runtime');
const { createRuntimeAdapter } = require('./adapters/genosRuntime');
const { createLedger } = require('./adapters/localModel');
const { SYSTEM_IDS: ADAPTED_SYSTEMS, createIndependentAdapter } = require('./adapters/independent');
const { verifyInChild } = require('./evaluation/verifyInChild');
const experimentExecutor = require('../../backend/src/services/endogenousThoughtCampaignExecutor');
const { CONDITIONS } = require('../../backend/src/services/endogenousThoughtExperimentService');

const PRIORITY = ['ETT-01', 'ETT-02', 'ETT-04', 'ETT-09'];
const ARGUMENT_SETTERS = Object.freeze({
  '--model': (options, value) => { options.model = value; },
  '--seeds': (options, value) => { options.seeds = Number(value); },
  '--scenarios': (options, value) => { options.scenarios = value; },
  '--conditions': (options, value) => { options.conditions = value.split(','); },
  '--token-budget': (options, value) => { options.tokenBudget = Number(value); },
  '--output': (options, value) => { options.output = value; },
  '--resume': (options, value) => { options.resume = value; }
});

function parseArguments(args) {
  const options = { model: 'ollama://qwen2.5:0.5b', seeds: 1, scenarios: 'priority',
    conditions: ['full'], tokenBudget: 250000, output: null, resume: null };
  for (let index = 0; index < args.length; index += 1) {
    const setter = ARGUMENT_SETTERS[args[index]];
    if (!setter) throw new Error(`Unknown argument: ${args[index]}`);
    setter(options, args[++index]);
  }
  if (options.resume && !options.output) options.output = options.resume;
  if (options.resume && path.resolve(options.output) !== path.resolve(options.resume)) {
    throw new Error('--resume and --output must identify the same report.');
  }
  validateOptions(options);
  return options;
}

function validateOptions(options) {
  if (!options.output || !Number.isSafeInteger(options.seeds) || options.seeds < 1
    || !Number.isSafeInteger(options.tokenBudget) || options.tokenBudget < 1) {
    throw new Error('Usage: run_runtime_campaign.js --output <new-report.json> [--model ollama://model]');
  }
  if (!['priority', 'all'].includes(options.scenarios)
    || options.conditions.some((item) => !['llm_only', ...ADAPTED_SYSTEMS].includes(item)
      && !CONDITIONS.includes(item))) {
    throw new Error('Scenario set or condition is not registered.');
  }
}

function scenarioModules(selection) {
  const ids = selection === 'all' ? runtime.SCENARIO_IDS : PRIORITY;
  return ids.map((id) => {
    const folders = fs.readdirSync(path.join(__dirname, 'scenarios'));
    const folder = folders.find((entry) => scenarioIdAt(entry) === id);
    if (!folder) throw new Error(`Executable scenario module missing: ${id}`);
    return require(path.join(__dirname, 'scenarios', folder, 'scenario.js'));
  });
}

function scenarioIdAt(folder) {
  const manifest = path.join(__dirname, 'scenarios', folder, 'scenario.json');
  return fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).id : null;
}

function seedList(count) {
  return Array.from({ length: count }, (_, index) => 1001 + index * 7919);
}

function orderedConditions(conditions, caseId) {
  let hash = 0;
  for (const character of caseId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const shift = hash % conditions.length;
  return [...conditions.slice(shift), ...conditions.slice(0, shift)];
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function writeReport(filename, report, initial) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (initial && fs.existsSync(filename)) throw new Error(`Output already exists: ${filename}`);
  const data = `${JSON.stringify(report, null, 2)}\n`;
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { flag: initial ? 'wx' : 'w' });
    fs.renameSync(temporary, filename);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function casePayload(testCase, model) {
  return { seed: Number(testCase.caseId.split('-').at(-1)),
    scenarioClass: testCase.scenarioId,
    problem: { problemId: testCase.caseId, statement: testCase.observation.objective },
    publicObservation: testCase.observation, model };
}

function redactOutcome(outcome) {
  const { providerCallDetails = [], ...rest } = outcome;
  return { ...rest, providerCallDetails };
}

async function executePair(context) {
  const { scenario, difficulty, seed, condition, model } = context;
  const testCase = scenario.build(difficulty, seed);
  const input = casePayload(testCase, model);
  const outcome = condition === 'llm_only'
    ? await executeDirectModel({ model, testCase })
    : ADAPTED_SYSTEMS.includes(condition)
      ? await executeAdaptedModel({ adapter: context.externalAdapters.get(condition), testCase })
      : await executeGenosRuntime({ condition, caseId: testCase.caseId, input, model, testCase });
  return { caseId: testCase.caseId, scenarioId: scenario.id, difficulty, seed, condition,
    split: 'development', holdout: false, observation: testCase.observation,
    observationHash: digest(testCase.observation), outcome: redactOutcome(outcome) };
}

async function executeAdaptedModel(context) {
  const system = context.adapter;
  try {
    const proposal = await system.solve(context.testCase);
    const verification = verifyInChild(context.testCase.oracle, proposal);
    system.recordVerified(context.testCase, proposal, verification);
    const usage = system.takeUsage();
    return { success: true, scientificEvidence: usage.measured,
      condition: system.id, verifiedDiscoveries: verification.usefulDiscoveries,
      normalizedCost: usage.tokens / 12000, measuredTokens: usage.tokens,
      measuredHostSeconds: usage.seconds, measuredCostUsd: 0,
      provider: system.model, providerCalls: usage.calls, providerCallDetails: usage.callDetails,
      submittedAnswerId: proposal.answerId, oracleVerdict: verification.verdict,
      oracleDigest: verification.oracleDigest, modelOutputIsEvidence: false,
      measurementStatus: 'ollama_provider_token_counters_and_host_time' };
  } catch (error) {
    const usage = system.takeUsage();
    return { success: false, scientificEvidence: false, condition: system.id,
      verifiedDiscoveries: 0, normalizedCost: usage.tokens / 12000,
      measuredTokens: usage.tokens, measuredHostSeconds: usage.seconds,
      measuredCostUsd: 0, provider: system.model, providerCalls: usage.calls,
      providerCallDetails: usage.callDetails, modelOutputIsEvidence: false,
      failure: { stage: 'adapted_model', code: 'ETT_ADAPTER_FAILED', message: error.message } };
  }
}

async function executeGenosRuntime(context) {
  const runtimeAdapter = createRuntimeAdapter({ model: context.model,
    observation: context.testCase.observation, oracle: context.testCase.oracle });
  return experimentExecutor.execute({ condition: context.condition,
    caseId: context.caseId, input: context.input, runtimeAdapter });
}

async function executeDirectModel(context) {
  const ledger = createLedger();
  try {
    const prompt = ['Choose the best candidate for the task objective using only the public evidence.',
      `Scenario: ${context.testCase.observation.scenario}`,
      `Objective: ${context.testCase.observation.objective}`,
      `Candidates: ${JSON.stringify(context.testCase.observation.candidates)}`,
      'Return JSON containing answerId and evidenceRefs.'].join('\n');
    const { value } = await ledger.generateJson({ model: context.model, prompt, maxTokens: 128 });
    const answerId = value.answerId;
    if (typeof answerId !== 'string') throw new Error('Direct model omitted answerId.');
    const evidenceRefs = Array.isArray(value.evidenceRefs) ? value.evidenceRefs : [`${answerId}:evidence`];
    const oracle = verifyInChild(context.testCase.oracle, { answerId, evidenceRefs });
    return { success: true, scientificEvidence: true, condition: 'llm_only',
      verifiedDiscoveries: oracle.usefulDiscoveries, normalizedCost: ledger.summary().tokens / 12000,
      measuredTokens: ledger.summary().tokens, measuredHostSeconds: ledger.summary().seconds,
      measuredCostUsd: 0, provider: context.model, providerCalls: ledger.summary().calls,
      providerCallDetails: ledger.summary().callDetails, submittedAnswerId: answerId,
      oracleVerdict: oracle.verdict, oracleDigest: oracle.oracleDigest,
      modelOutputIsEvidence: false, measurementStatus: 'ollama_provider_token_counters_and_host_time' };
  } catch (error) {
    const usage = ledger.summary();
    return { success: false, scientificEvidence: false, condition: 'llm_only',
      verifiedDiscoveries: 0, normalizedCost: usage.tokens / 12000,
      measuredTokens: usage.tokens, measuredHostSeconds: usage.seconds,
      measuredCostUsd: 0, provider: context.model, providerCalls: usage.calls,
      providerCallDetails: usage.callDetails, modelOutputIsEvidence: false,
      failure: { stage: 'direct_solve', code: 'ETT_DIRECT_MODEL_FAILED', message: error.message } };
  }
}

function buildTasks(options, scenarios) {
  const tasks = [];
  for (const seed of seedList(options.seeds)) {
    for (const scenario of scenarios) {
      for (const difficulty of runtime.LEVELS) {
        const caseId = `${scenario.id}:${difficulty}:${seed}`;
        for (const condition of orderedConditions(options.conditions, caseId)) {
          tasks.push({ seed, scenario, difficulty, condition });
        }
      }
    }
  }
  return tasks;
}

function taskKey(record) {
  return `${record.scenarioId}:${record.difficulty}:${record.seed}:${record.condition}`;
}

function remainingTasks(tasks, records) {
  const completed = new Set(records.map(taskKey));
  return tasks.filter((task) => !completed.has(`${task.scenario.id}:${task.difficulty}:${task.seed}:${task.condition}`));
}

function validateResumeMetadata(report, options) {
  const expected = { schema: 'genos.ett-runtime-campaign/v1', model: options.model,
    scenarioSet: options.scenarios, conditions: options.conditions,
    split: 'development', holdout: false };
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(report[key]) !== JSON.stringify(value)) {
      throw new Error(`Resume report mismatch for ${key}.`);
    }
  }
}

function validateResumeStatus(report) {
  if (!['running', 'partial_global_token_budget_reserve_reached',
    'partial_segment_token_budget_reserve_reached', 'partial_campaign_token_budget_reached'].includes(report.status)
    || !Array.isArray(report.records)) throw new Error('Report is not an incomplete resumable campaign.');
}

function validateResumeBudget(report, options) {
  if (!Number.isSafeInteger(report.tokenBudget) || !Number.isSafeInteger(report.measuredTokens)
    || report.measuredTokens < 0 || options.tokenBudget < report.tokenBudget
    || report.measuredTokens >= options.tokenBudget) {
    throw new Error('Campaign-wide token budget is exhausted or cannot be lowered on resume.');
  }
}

function recordBudgetAdjustment(report, options) {
  if (options.tokenBudget > report.tokenBudget) {
    report.budgetAdjustments = [...(report.budgetAdjustments || []), {
      previousTokenBudget: report.tokenBudget, tokenBudget: options.tokenBudget,
      updatedAt: new Date().toISOString(), source: 'explicit_resume_cli_option' }];
    report.tokenBudget = options.tokenBudget;
  }
}

function validateSeedPrefix(report, options) {
  const targetSeeds = seedList(options.seeds);
  if (!Array.isArray(report.seeds) || report.seeds.length > targetSeeds.length
    || !report.seeds.every((seed, index) => seed === targetSeeds[index])) {
    throw new Error('Resume seeds must extend the report seed list without changing its prefix.');
  }
  return targetSeeds;
}

function normalizeResumeStatuses(report) {
  const legacyStatuses = ['partial_global_token_budget_reserve_reached',
    'partial_segment_token_budget_reserve_reached'];
  if (legacyStatuses.includes(report.status)) report.status = 'partial_campaign_token_budget_reached';
  for (const segment of report.segments || []) {
    if (legacyStatuses.includes(segment.status)) segment.status = 'partial_campaign_token_budget_reached';
  }
}

function validateResume(report, options) {
  validateResumeMetadata(report, options);
  validateResumeStatus(report);
  validateResumeBudget(report, options);
  recordBudgetAdjustment(report, options);
  const targetSeeds = validateSeedPrefix(report, options);
  report.seeds = targetSeeds;
  normalizeResumeStatuses(report);
}

function validateStoredRecords(report, scenarios) {
  const registry = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const seen = new Set();
  for (const record of report.records) {
    const key = taskKey(record);
    const scenario = registry.get(record.scenarioId);
    if (!scenario || seen.has(key) || !report.conditions.includes(record.condition)) {
      throw new Error(`Resume report contains an unknown or duplicate case: ${key}.`);
    }
    const testCase = scenario.build(record.difficulty, record.seed);
    if (digest(testCase.observation) !== record.observationHash) {
      throw new Error(`Resume report scenario data changed for ${key}.`);
    }
    seen.add(key);
  }
}

function beginSegment(report, options) {
  if (!Array.isArray(report.segments)) report.segments = [{ index: 1,
    startedAt: report.startedAt, finishedAt: report.finishedAt, startingRecordCount: 0,
    endingRecordCount: report.records.length, tokenBudget: report.tokenBudget,
    measuredTokens: report.measuredTokens, status: report.status, migratedLegacy: true }];
  const previous = report.segments.at(-1);
  if (previous?.status === 'running') {
    previous.status = 'interrupted_before_resume';
    previous.recoveredAt = new Date().toISOString();
  }
  const segment = { index: report.segments.length + 1, startedAt: new Date().toISOString(),
    startingRecordCount: report.records.length, endingRecordCount: report.records.length,
    tokenBudget: options.tokenBudget, measuredTokens: 0, status: 'running' };
  report.segments.push(segment);
  report.status = 'running';
  return segment;
}

async function executeTasks(context) {
  let exhausted = false;
  for (const task of context.tasks) {
    if (context.options.tokenBudget - context.report.measuredTokens < 12000) {
      exhausted = true;
      break;
    }
    const record = await executePair({ ...task, model: context.options.model,
      externalAdapters: context.externalAdapters });
    context.report.measuredTokens += record.outcome.measuredTokens || 0;
    context.report.records.push(record);
    context.segment.measuredTokens += record.outcome.measuredTokens || 0;
    context.segment.endingRecordCount = context.report.records.length;
    writeReport(context.output, context.report, false);
  }
  return exhausted;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const output = path.resolve(options.output);
  const scenarios = scenarioModules(options.scenarios);
  const tasks = buildTasks(options, scenarios);
  const report = options.resume ? JSON.parse(fs.readFileSync(output, 'utf8'))
    : createReport(options, tasks.length);
  if (options.resume) {
    validateResume(report, options);
    validateStoredRecords(report, scenarios);
  }
  report.seeds = seedList(options.seeds);
  report.expectedRecords = tasks.length;
  const segment = beginSegment(report, options);
  writeReport(output, report, !options.resume);
  const externalAdapters = new Map(ADAPTED_SYSTEMS.filter((id) => options.conditions.includes(id))
    .map((id) => [id, createIndependentAdapter(id, { model: options.model })]));
  restoreAdapterState(externalAdapters, report.records);
  const pending = remainingTasks(tasks, report.records);
  const exhausted = await executeTasks({ report, options, tasks: pending, externalAdapters, output, segment });
  report.status = exhausted ? 'partial_campaign_token_budget_reached' : 'descriptive_runtime_run_complete';
  segment.status = report.status === 'descriptive_runtime_run_complete' ? 'complete' : report.status;
  segment.finishedAt = new Date().toISOString();
  report.finishedAt = new Date().toISOString();
  report.expectedRecords = tasks.length;
  report.completedRecords = report.records.length;
  writeReport(output, report, false);
  process.stdout.write(JSON.stringify({ status: report.status, output,
    completedRecords: report.completedRecords, expectedRecords: report.expectedRecords,
    measuredTokens: report.measuredTokens, scientificClaimAllowed: false }) + '\n');
  return report;
}

function createReport(options, expectedRecords) {
  return { schema: 'genos.ett-runtime-campaign/v1', status: 'running',
    startedAt: new Date().toISOString(), model: options.model,
    scenarioSet: options.scenarios, conditions: options.conditions, seeds: seedList(options.seeds),
    tokenBudget: options.tokenBudget, split: 'development', holdout: false,
    expectedRecords, measuredTokens: 0, records: [], segments: [], scientificClaimAllowed: false,
    limitations: ['Local model run; no external API price is measured.',
      'Original Voyager, AI Scientist v2 and DGM executables are not included.'] };
}

function restoreAdapterState(adapters, records) {
  const voyager = adapters.get('voyager_adapted');
  if (!voyager) return;
  for (const record of records) {
    if (record.condition !== 'voyager_adapted') continue;
    voyager.recordVerified({ scenarioId: record.scenarioId, difficulty: record.difficulty,
      observation: record.observation },
    { answerId: record.outcome.submittedAnswerId }, { verdict: record.outcome.oracleVerdict });
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`ETT_RUNTIME_CAMPAIGN_FAILED: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { parseArguments, scenarioModules, buildTasks, casePayload,
  taskKey, remainingTasks, validateResume, validateStoredRecords,
  restoreAdapterState, main };
