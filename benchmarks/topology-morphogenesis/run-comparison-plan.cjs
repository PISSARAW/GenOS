'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const root = __dirname;
const repo = path.resolve(root, '../..');
const suite = JSON.parse(fs.readFileSync(path.join(root, 'suite.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(root, 'comparison-plan.json'), 'utf8'));
const outputRoot = path.resolve(process.env.GENOS_COMPARISON_OUTPUT_ROOT || path.join(repo, 'artifacts', 'topology-morphogenesis', 'comparison-plans'));

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function seedGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleConditions(conditions, seed) {
  const shuffled = [...conditions];
  const random = seedGenerator(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function validatePlan() {
  const conditionIds = plan.conditions.map((condition) => condition.id);
  if (new Set(conditionIds).size !== conditionIds.length) throw new Error('Comparison condition IDs must be unique.');
  if (plan.budgetPolicy !== suite.controls.budgetPolicy) throw new Error('Comparison budget policy differs from the suite contract.');
  for (const taskId of plan.eligibleTaskIds) {
    const task = suite.tasks.find((entry) => entry.id === taskId);
    if (!task || task.oracle.status !== 'independent' || !task.comparisonEligible) {
      throw new Error(`Task is not eligible for comparison: ${taskId}`);
    }
  }
}

function makeBlocks() {
  const blocks = [];
  for (const taskId of plan.eligibleTaskIds) {
    for (const seed of plan.seedBlocks) {
      blocks.push({ taskId, seed, orderedConditionIds: shuffleConditions(plan.conditions, seed + blocks.length).map((condition) => condition.id) });
    }
  }
  return blocks;
}

function main() {
  validatePlan();
  const timestamp = new Date().toISOString();
  const runId = `schedule-${timestamp.replace(/[:.]/g, '-')}`;
  const schedule = {
    schemaVersion: 1,
    planId: plan.planId,
    runId,
    createdAt: timestamp,
    status: 'assignment-only',
    suiteSha256: digest(fs.readFileSync(path.join(root, 'suite.json'))),
    planSha256: digest(fs.readFileSync(path.join(root, 'comparison-plan.json'))),
    conditions: plan.conditions,
    blocks: makeBlocks(),
    executionResults: null,
    limitations: plan.limitations
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputFile = path.join(outputRoot, `${runId}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(schedule, null, 2));
  process.stdout.write(`${outputFile}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { shuffleConditions };
