'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { executeCondition } = require('./comparisonAdapters.cjs');
const { verifyCandidate } = require('./oracles.cjs');
const { loadExternalOracle } = require('./externalComparisonOracle.cjs');

const root = __dirname;
const repo = path.resolve(root, '../..');
const plan = require('./comparison-plan.json');
const pilot = require('./comparison-task-set.json');
const outputRoot = path.resolve(process.env.GENOS_COMPARISON_OUTPUT_ROOT
  || path.join(repo, 'artifacts', 'topology-morphogenesis', 'comparison-campaigns'));

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function parseArgs(args) {
  const options = { mode: 'pilot', dataset: null, conditions: null };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--mode') options.mode = args[++index];
    else if (args[index] === '--dataset') options.dataset = args[++index];
    else if (args[index] === '--conditions') options.conditions = args[++index].split(',');
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return options;
}

function loadTasks(options) {
  if (!options.dataset) {
    if (options.mode !== 'pilot') throw new Error('Confirmatory mode requires an identified external holdout dataset.');
    return { data: pilot, file: path.join(root, plan.taskSetFile), training: null };
  }
  const file = path.resolve(options.dataset);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateExternalDataset(data, options.mode);
  if (options.mode === 'confirmatory') for (const task of data.tasks) {
    loadExternalOracle(task, file, data.trainingInventory.oracleIds);
  }
  return { data, file, training: data.trainingInventory };
}

function validateExternalDataset(data, mode) {
  if (!data.datasetId || !data.source || !Array.isArray(data.tasks) || !data.tasks.length) throw new Error('External dataset needs datasetId, source and tasks.');
  if (mode === 'confirmatory') {
    const inventory = data.trainingInventory;
    if (data.split !== 'holdout' || !inventory?.source || !inventory.taskIds?.length
      || !inventory.taskFamilies?.length || !inventory.models?.length || !inventory.oracleIds?.length) {
      throw new Error('Confirmatory mode requires a holdout split and sourced task/family/model/oracle training inventories.');
    }
    if (data.tasks.some((task) => inventory.taskIds.includes(task.id)
      || inventory.taskFamilies.includes(task.family) || !task.oracleId || !task.oracleModule
      || !task.oracleSha256 || inventory.oracleIds.includes(task.oracleId))) {
      throw new Error('Confirmatory holdout overlaps training or lacks a new hashed oracle module.');
    }
    const model = process.env.GENOS_COMPARISON_MODEL || 'qwen2.5-coder:7b';
    if (inventory.models.includes(model)) throw new Error('Confirmatory model is present in the training inventory.');
  }
  if (data.tasks.some((task) => !task.comparisonEligible || !task.prompt || !task.oracle)) {
    throw new Error('Every external task must declare prompt, independent oracle, and comparison eligibility.');
  }
}

function selectConditions(options) {
  const selected = plan.conditions.filter((condition) => !options.conditions || options.conditions.includes(condition.id));
  if (!selected.length || selected.some((condition) => condition.adapter === 'pending')) {
    throw new Error('Selected condition has no executable adapter.');
  }
  if (options.conditions && selected.length !== options.conditions.length) throw new Error('Unknown condition ID in --conditions.');
  return selected;
}

function randomOrder(values, seed) {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const output = [...values];
  for (let index = output.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

function makeBlocks(tasks, conditions) {
  const blocks = [];
  for (const task of tasks) for (const seed of plan.seedBlocks) {
    blocks.push({ taskId: task.id, seed, conditions: randomOrder(conditions, seed + blocks.length).map((entry) => entry.id) });
  }
  return blocks;
}

function taskWorkspace(runId, blockId, conditionId) {
  const base = path.join(outputRoot, runId, 'attempts', `${blockId}-${conditionId}`);
  fs.mkdirSync(base, { recursive: true });
  return { workspace: path.join(base, 'workspace'), dbPath: path.join(base, 'mission.db') };
}

async function runAttempt(input) {
  const { condition, task, block, runId, options, datasetFile } = input;
  const isolated = taskWorkspace(runId, block.blockId, condition.id);
  fs.mkdirSync(isolated.workspace, { recursive: true });
  const attempt = { conditionId: condition.id, taskId: task.id, seed: block.seed,
    requestedModel: process.env.GENOS_COMPARISON_MODEL || 'qwen2.5-coder:7b',
    requestedBudget: plan.executionBudget, toolPolicy: plan.toolPolicy,
    startedAt: new Date().toISOString() };
  const result = await executeCondition(condition, task, { ...plan.executionBudget,
    model: attempt.requestedModel, seed: block.seed, ...isolated });
  const oracleFn = options.mode === 'confirmatory'
    ? loadExternalOracle(task, datasetFile, input.trainingOracleIds).verify
    : (candidate) => verifyCandidate(task, candidate);
  const oracle = result.candidate ? oracleFn(result.candidate) : { passed: false, reason: 'no-parseable-candidate' };
  const servedModelVerified = result.servedModel === attempt.requestedModel;
  const budgetWithinLimit = Number.isFinite(result.tokenUsage.total)
    && result.tokenUsage.total <= plan.executionBudget.tokens
    && result.latencyMs <= plan.executionBudget.latencyMs;
  const runtimeValid = result.runtimeSucceeded !== false && result.allWorkersCompleted !== false;
  return { ...attempt, ...result, servedModelVerified, oracle, endedAt: new Date().toISOString(),
    budgetWithinLimit, runtimeValid,
    externalToolPolicySatisfied: result.toolUseCount === 0,
    evidenceStatus: oracle.passed && budgetWithinLimit && servedModelVerified && runtimeValid
      && result.toolUseCount === 0 ? 'verified-attempt' : oracle.passed ? 'fairness-unverified' : 'oracle-failed' };
}

async function runCampaign(options) {
  const taskInfo = loadTasks(options);
  const conditions = selectConditions(options);
  const timestamp = new Date().toISOString();
  const runId = `comparison-${timestamp.replace(/[:.]/g, '-')}`;
  fs.mkdirSync(path.join(outputRoot, runId), { recursive: true });
  const blocks = makeBlocks(taskInfo.data.tasks, conditions);
  const attempts = [];
  for (const block of blocks) {
    const task = taskInfo.data.tasks.find((entry) => entry.id === block.taskId);
    for (const conditionId of block.conditions) {
      const condition = conditions.find((entry) => entry.id === conditionId);
      const blockId = `${block.taskId}-${block.seed}`;
      try { attempts.push(await runAttempt({ condition, task, block: { ...block, blockId }, runId,
        options, datasetFile: taskInfo.file, trainingOracleIds: taskInfo.training?.oracleIds || [] })); }
      catch (error) {
        attempts.push({ conditionId, taskId: task.id, seed: block.seed, status: 'execution-error',
          error: error.message, latencyMs: null, tokenUsage: null, oracle: { passed: false }, evidenceStatus: 'inconclusive' });
      }
    }
  }
  const result = { schemaVersion: 1, runId, protocolVersion: plan.protocolVersion,
    status: options.mode === 'pilot' ? 'pilot-execution' : 'confirmatory-execution',
    mode: options.mode, startedAt: timestamp, completedAt: new Date().toISOString(),
    dataset: { id: taskInfo.data.datasetId || 'bundled-toy-pilot', sha256: sha256(fs.readFileSync(taskInfo.file)) },
    requestedModel: process.env.GENOS_COMPARISON_MODEL || 'qwen2.5-coder:7b',
    modelEndpoint: process.env.GENOS_COMPARISON_OLLAMA_URL || 'http://127.0.0.1:11434/api/chat',
    budget: plan.executionBudget, toolPolicy: plan.toolPolicy, conditions,
    blocks, attempts, limitations: plan.limitations,
    confirmatoryEligible: options.mode === 'confirmatory' && attempts.every((entry) => entry.evidenceStatus === 'verified-attempt'
      && entry.budgetWithinLimit && entry.externalToolPolicySatisfied) };
  const output = path.join(outputRoot, runId, 'results.json');
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  return { output, runId, attemptCount: attempts.length, passed: attempts.filter((entry) => entry.oracle?.passed).length,
    confirmatoryEligible: result.confirmatoryEligible };
}

async function main() {
  try {
    const summary = await runCampaign(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}

if (require.main === module) main();
module.exports = { loadTasks, parseArgs, runCampaign, validateExternalDataset };
