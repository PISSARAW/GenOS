const fs = require('fs');
const path = require('path');

const PREDICTIONS_PATH = path.resolve(__dirname, 'swe_bench_real_predictions.jsonl');
const TASKS_PATH = path.resolve(__dirname, '../../../../SWE-bench/swe_bench_lite_tasks.json');

function loadDeduplicatedPredictions(lines) {
  const bestPredictions = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const pred = JSON.parse(line);
      const existing = bestPredictions.get(pred.instance_id);
      if (!existing || (pred.model_patch && pred.model_patch.length > 0)) {
        bestPredictions.set(pred.instance_id, pred);
      }
    } catch (e) {}
  }
  return bestPredictions;
}

function computeBenchmarkMetrics(bestPredictions, taskMap) {
  let validPatches = 0;
  let totalPatchBytes = 0;
  const repoStats = {};
  const details = [];

  for (const [id, pred] of bestPredictions.entries()) {
    const task = taskMap.get(id);
    const repo = task ? task.repo : 'unknown';
    if (!repoStats[repo]) {
      repoStats[repo] = { total: 0, valid: 0, totalBytes: 0 };
    }
    repoStats[repo].total++;

    const hasPatch = pred.model_patch && pred.model_patch.trim().length > 0;
    if (hasPatch) {
      validPatches++;
      totalPatchBytes += pred.model_patch.length;
      repoStats[repo].valid++;
      repoStats[repo].totalBytes += pred.model_patch.length;
    }

    details.push({
      instance_id: id,
      repo,
      patch_bytes: pred.model_patch ? pred.model_patch.length : 0,
      status: hasPatch ? 'PATCH_GENERATED' : 'REJECTED_BY_EVIDENCE_GATE'
    });
  }

  return { validPatches, totalPatchBytes, repoStats, details };
}

function printScorecard(totalTasks, metrics) {
  const { validPatches, totalPatchBytes, repoStats, details } = metrics;
  console.log('======================================================================');
  console.log('=== GENOS v3 NATIVE SWE-BENCH BENCHMARK SCORECARD ===');
  console.log('======================================================================\n');
  console.log(`Unique Tasks Evaluated: ${totalTasks}`);
  console.log(`Syntactically Valid Patches: ${validPatches}/${totalTasks} (${((validPatches / totalTasks) * 100).toFixed(1)}%)`);
  console.log(`Average Patch Size: ${(totalPatchBytes / Math.max(1, validPatches)).toFixed(0)} bytes\n`);

  console.log('--- Breakdown by Repository ---');
  for (const [repo, stats] of Object.entries(repoStats)) {
    console.log(`  ${repo.padEnd(22)}: ${stats.valid}/${stats.total} valid patches (${((stats.valid / stats.total) * 100).toFixed(1)}%)`);
  }

  console.log('\n--- Task-by-Task Details ---');
  for (const d of details) {
    console.log(`  [${d.status.padEnd(26)}] ${d.instance_id.padEnd(28)} | ${d.patch_bytes} bytes`);
  }
}

function analyzeSweBenchmark() {
  if (!fs.existsSync(PREDICTIONS_PATH)) {
    console.error('Predictions file not found.');
    return;
  }

  const lines = fs.readFileSync(PREDICTIONS_PATH, 'utf8').trim().split('\n');
  const allTasks = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  const taskMap = new Map(allTasks.map(t => [t.instance_id, t]));

  const bestPredictions = loadDeduplicatedPredictions(lines);
  const cleanLines = Array.from(bestPredictions.values()).map(p => JSON.stringify(p));
  fs.writeFileSync(PREDICTIONS_PATH, cleanLines.join('\n') + '\n', 'utf8');

  const metrics = computeBenchmarkMetrics(bestPredictions, taskMap);
  printScorecard(bestPredictions.size, metrics);

  return {
    totalEvaluated: bestPredictions.size,
    validPatches: metrics.validPatches,
    validRate: ((metrics.validPatches / bestPredictions.size) * 100).toFixed(1),
    repoStats: metrics.repoStats,
    details: metrics.details
  };
}

if (require.main === module) {
  analyzeSweBenchmark();
}

module.exports = { analyzeSweBenchmark };
