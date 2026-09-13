/**
 * GenOS SWE-bench Autonomous Evaluation Runner
 * Executes real GenOS v3 agent fleets across SWE-bench tasks without Docker,
 * tracking real dynamic pytest resolutions, eureka moments, and agent cognitive health.
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db');
const { solveTaskWithFleet } = require('./swe_closed_loop_orchestrator');

const TASKS_PATH = path.resolve(__dirname, '../../../../SWE-bench/swe_bench_lite_tasks.json');
const PREDICTIONS_PATH = path.resolve(__dirname, 'swe_bench_real_predictions.jsonl');

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = { repo: null, instance: null, limit: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo') options.repo = args[++i];
    if (args[i] === '--instance') options.instance = args[++i];
    if (args[i] === '--limit') options.limit = parseInt(args[++i], 10);
  }
  return options;
}

const REPOS_DIR = path.resolve(__dirname, '../../../../.genos-agent-worlds/swe_repos');

function filterTargetTasks(tasks, options) {
  let list = tasks.filter(t => fs.existsSync(path.join(REPOS_DIR, t.repo.replace('/', '__'))));
  if (options.instance) {
    list = list.filter(t => t.instance_id === options.instance);
  }
  if (options.repo) {
    list = list.filter(t => t.repo === options.repo);
  }
  if (options.limit && options.limit > 0) {
    list = list.slice(0, options.limit);
  }
  return list;
}

function appendPrediction(prediction) {
  if (!prediction.model_patch || prediction.model_patch.trim().length === 0) return;
  if (prediction.status === 'RESOLVED_PLASMID_MEMORY') return;
  const line = JSON.stringify({
    instance_id: prediction.instance_id,
    model_patch: prediction.model_patch,
    model_name_or_path: prediction.model_name_or_path
  }) + '\n';
  fs.appendFileSync(PREDICTIONS_PATH, line, 'utf8');
}

function printScorecard(results) {
  const total = results.length;
  const resolved = results.filter(r => r.success).length;
  const rate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';

  console.log(`\n======================================================================`);
  console.log(`=== REAL GENOS v3 AGENT FLEET DYNAMIC SWE-BENCH SCORECARD ===`);
  console.log(`======================================================================`);
  console.log(`  Total Tasks Evaluated          : ${total}`);
  console.log(`  Dynamically Resolved Tasks     : ${resolved} / ${total} (${rate} %)`);
  console.log(`  Environment                    : Native Windows Host (No Docker)`);
  console.log(`  Inference Engine               : Local GPU (ollama://deepseek-coder-v2:latest)`);
  console.log(`  Verification Method            : Dynamic Pytest (FAIL_TO_PASS & PASS_TO_PASS)`);
  console.log(`======================================================================`);

  for (const r of results) {
    const mark = r.success ? '[RESOLVED]' : '[UNRESOLVED]';
    console.log(`  ${mark.padEnd(14)} ${r.instance_id} (${r.status})`);
  }
  console.log(`======================================================================\n`);
}

async function runAutonomousSweEvaluation() {
  const options = parseCliArgs();
  const rawData = fs.readFileSync(TASKS_PATH, 'utf8');
  const allTasks = JSON.parse(rawData);
  const tasksToRun = filterTargetTasks(allTasks, options);

  console.log(`[SWE RUNNER] Selected ${tasksToRun.length} task(s) for native multi-agent evaluation.`);
  const results = [];

  for (let i = 0; i < tasksToRun.length; i++) {
    const task = tasksToRun[i];
    console.log(`\n>>> Progress: [${i + 1}/${tasksToRun.length}] Processing ${task.instance_id}...`);
    try {
      const outcome = await solveTaskWithFleet(task, options);
      results.push(outcome);
      if (outcome.success) {
        appendPrediction(outcome);
      }
    } catch (err) {
      console.error(`  [ERROR] Task ${task.instance_id} failed:`, err.message);
      results.push({ instance_id: task.instance_id, success: false, status: 'ERROR', model_patch: '' });
    }
  }

  printScorecard(results);
}

if (require.main === module) {
  runAutonomousSweEvaluation().catch(err => {
    console.error('Fatal evaluation failure:', err);
    process.exit(1);
  });
}

module.exports = {
  runAutonomousSweEvaluation
};
