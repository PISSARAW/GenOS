#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const runtime = require('./scenarios/runtime');
const { createRuntimeAdapter } = require('./adapters/genosRuntime');
const { executeDirectModel } = require('./adapters/directLlm');
const { SYSTEM_IDS: ADAPTED_SYSTEMS, createIndependentAdapter } = require('./adapters/independent');
const { verifyInChild } = require('./evaluation/verifyInChild');
const { createCampaignBudgetGuard } = require('./adapters/campaignBudgetGuard');
const { createUsageJournal } = require('./adapters/campaignUsageJournal');
const { campaignStatus, createReport } = require('./adapters/campaignReceipt');
const { writeReport } = require('./adapters/campaignReportWriter');
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
    const scenario = require(path.join(__dirname, 'scenarios', folder, 'scenario.js'));
    if (typeof scenario.createWorld !== 'function' || typeof scenario.run !== 'function') {
      throw new Error(`Scenario is not executable through the action contract: ${id}`);
    }
    return scenario;
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

function actionsTaken(world) {
  return world.observation.actionBudget - world.remaining;
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
  const world = scenario.createWorld(difficulty, seed);
  const agentCase = { caseId: testCase.caseId, scenarioId: testCase.scenarioId,
    difficulty: testCase.difficulty, observation: world.observation, world };
  const input = casePayload(agentCase, model);
  context.budgetGuard?.setContext({ caseId: testCase.caseId, scenarioId: testCase.scenarioId,
    difficulty, seed, condition });
  const outcome = condition === 'llm_only'
    ? await executeDirectModel({ model, testCase: agentCase,
      budgetGuard: context.budgetGuard,
      oracle: { ...testCase.oracle, requireInspection: true, requireInteraction: true } })
    : ADAPTED_SYSTEMS.includes(condition)
      ? await executeAdaptedModel({ adapter: context.externalAdapters.get(condition),
        testCase: agentCase, oracle: { ...testCase.oracle, requireInspection: true,
          requireInteraction: true } })
      : await executeGenosRuntime({ condition, caseId: testCase.caseId, input, model,
        testCase: agentCase, oracle: { ...testCase.oracle, requireInspection: true,
          requireInteraction: true } });
  return { caseId: testCase.caseId, scenarioId: scenario.id, difficulty, seed, condition,
    split: 'development', holdout: false, observation: agentCase.observation,
    observationHash: digest(agentCase.observation), actionTrace: world.trace,
    outcome: redactOutcome(outcome) };
}

async function executeAdaptedModel(context) {
  const system = context.adapter;
  try {
    const proposal = await system.solve(context.testCase);
    const verification = verifyInChild(context.oracle, proposal);
    system.recordVerified(context.testCase, proposal, verification);
    const usage = system.takeUsage();
    return { success: true, scientificEvidence: usage.measured,
      condition: system.id, verifiedDiscoveries: verification.usefulDiscoveries,
      normalizedCost: usage.tokens / 12000, measuredTokens: usage.tokens,
      measuredHostSeconds: usage.seconds, measuredCostUsd: 0,
      actions: proposal.actions || 0,
      provider: system.model, providerCalls: usage.calls, providerCallDetails: usage.callDetails,
      submittedAnswerId: proposal.answerId, oracleVerdict: verification.verdict,
      oracleDigest: verification.oracleDigest, oracleMetrics: verification.domainMetrics,
      modelOutputIsEvidence: false,
      measurementStatus: 'ollama_provider_token_counters_and_host_time' };
  } catch (error) {
    const usage = system.takeUsage();
    return { success: false, scientificEvidence: false, condition: system.id,
      actions: actionsTaken(context.testCase.world),
      verifiedDiscoveries: 0, normalizedCost: usage.tokens / 12000,
      measuredTokens: usage.tokens, measuredHostSeconds: usage.seconds,
      measuredCostUsd: 0, provider: system.model, providerCalls: usage.calls,
      providerCallDetails: usage.callDetails, modelOutputIsEvidence: false,
      failure: { stage: 'adapted_model', code: 'ETT_ADAPTER_FAILED', message: error.message } };
  }
}

async function executeGenosRuntime(context) {
  const runtimeAdapter = createRuntimeAdapter({ model: context.model,
    observation: context.testCase.observation, oracle: context.oracle,
    world: context.testCase.world, budgetGuard: context.budgetGuard,
    callContext: { caseId: context.caseId, scenarioId: context.testCase.scenarioId,
      difficulty: context.testCase.difficulty, condition: context.condition } });
  const outcome = await experimentExecutor.execute({ condition: context.condition,
    caseId: context.caseId, input: context.input, runtimeAdapter });
  return { ...outcome, actions: actionsTaken(context.testCase.world),
    oracleMetrics: runtimeAdapter.verificationSummary()?.domainMetrics || {} };
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
  const expected = { schema: 'genos.ett-runtime-campaign/v4', model: options.model,
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
    const world = scenario.createWorld(record.difficulty, record.seed);
    if (digest(world.observation) !== record.observationHash) {
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
  let stopReason = null;
  for (const task of context.tasks) {
    if (context.options.tokenBudget - context.report.measuredTokens < 12000) {
      exhausted = true;
      stopReason = 'token_budget_case_reserve_reached';
      break;
    }
    const record = await executePair({ ...task, model: context.options.model,
      externalAdapters: context.externalAdapters, budgetGuard: context.budgetGuard });
    context.report.records.push(record);
    context.segment.measuredTokens = context.report.measuredTokens - context.segment.startingMeasuredTokens;
    context.segment.endingRecordCount = context.report.records.length;
    writeReport(context.output, context.report, false);
    if (context.budgetGuard.stopReason) {
      exhausted = true;
      stopReason = context.budgetGuard.stopReason;
      break;
    }
  }
  return { exhausted, stopReason };
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const output = path.resolve(options.output);
  const scenarios = scenarioModules(options.scenarios);
  const tasks = buildTasks(options, scenarios);
  const report = options.resume ? JSON.parse(fs.readFileSync(output, 'utf8'))
    : createReport(options, tasks.length);
  if (!options.resume && fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
  let segment = null;
  const usageJournal = createUsageJournal({ output, report, resume: Boolean(options.resume),
    persist: () => {
      if (segment) segment.measuredTokens = report.measuredTokens - segment.startingMeasuredTokens;
      writeReport(output, report, false);
    } });
  if (options.resume) {
    validateResume(report, options);
    validateStoredRecords(report, scenarios);
  }
  report.seeds = seedList(options.seeds);
  report.expectedRecords = tasks.length;
  segment = beginSegment(report, options);
  segment.startingMeasuredTokens = report.measuredTokens;
  writeReport(output, report, !options.resume);
  const budgetGuard = createCampaignBudgetGuard({ tokenBudget: options.tokenBudget,
    initialTokens: usageJournal.initialTokens || 0, initialSequence: usageJournal.initialSequence || 0,
    onDispatch: usageJournal.onDispatch, onResponse: usageJournal.onResponse });
  const externalAdapters = new Map(ADAPTED_SYSTEMS.filter((id) => options.conditions.includes(id))
    .map((id) => [id, createIndependentAdapter(id, { model: options.model, budgetGuard })]));
  restoreAdapterState(externalAdapters, report.records);
  const pending = remainingTasks(tasks, report.records);
  const execution = await executeTasks({ report, options, tasks: pending, externalAdapters,
    output, segment, budgetGuard });
  report.stopReason = execution.stopReason;
  report.status = execution.exhausted ? campaignStatus(execution.stopReason)
    : 'descriptive_runtime_run_complete';
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
  restoreAdapterState, executeTasks, campaignStatus, main };
