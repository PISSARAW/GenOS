/**
 * GenOS - General AI Assistant Benchmark (GAIA) Test Suite
 * Validates GenOS Cognitive Multi-Modal Agent against official GAIA validation set.
 * Evaluates all 3 difficulty tiers:
 *  - Level 1: 53 tasks (elementary multimodal, direct text/math)
 *  - Level 2: 86 tasks (multi-tool chaining, table/PDF extraction)
 *  - Level 3: 26 tasks (causal multi-step reasoning, complex synthesis)
 * Total: 165 tasks.
 *
 * Requirements:
 *  - 0 Docker containers required (Native Windows execution)
 *  - Deterministic evaluation using official gaia_scorer.py
 *  - Target accuracy: >= 95% per level (official validation benchmark)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findGaiaPython(gaiaDir) {
  const winVenv = path.join(gaiaDir, 'venv_win', 'Scripts', 'python.exe');
  if (fs.existsSync(winVenv)) return winVenv;
  const unixVenv = path.join(gaiaDir, 'venv', 'bin', 'python');
  if (fs.existsSync(unixVenv)) return unixVenv;
  return 'python';
}

function runGaiaEvaluation(gaiaDir) {
  const pyBin = findGaiaPython(gaiaDir);
  const cmd = `"${pyBin}" run_gaia_eval.py --level all --output gaia_results.json`;
  console.log(`[GAIA] Executing: ${cmd}`);
  return execSync(cmd, { cwd: gaiaDir, encoding: 'utf8', timeout: 180000 });
}

function getGaiaResults(gaiaDir) {
  const resPath = path.join(gaiaDir, 'gaia_results.json');
  if (!fs.existsSync(resPath)) return null;
  return JSON.parse(fs.readFileSync(resPath, 'utf8'));
}

function verifyLevelAccuracy(byLevel, lvl, expectedTotal) {
  const lvlStats = byLevel[lvl] || byLevel[String(lvl)];
  assert.ok(lvlStats, `Missing results for Level ${lvl}`);
  console.log(`  [LEVEL ${lvl}] Passed: ${lvlStats.passed} / ${lvlStats.total} (${lvlStats.accuracy}%)`);
  assert.strictEqual(lvlStats.total, expectedTotal, `Level ${lvl} total mismatch`);
  assert.ok(lvlStats.accuracy >= 95.0, `Level ${lvl} accuracy ${lvlStats.accuracy}% below 95%`);
}

async function runGaiaTestSuite() {
  console.log('===============================================================');
  console.log('       GenOS V3 - GAIA Full Benchmark Evaluation Suite         ');
  console.log('===============================================================');

  const gaiaDir = path.resolve(__dirname, '../../../GAIA');
  if (!fs.existsSync(gaiaDir)) {
    console.log(JSON.stringify({ status: 'SKIPPED', reason: 'external_checkout_absent', score: null }));
    if (process.env.GENOS_GAIA_REQUIRED === '1') throw new Error('GAIA is required but the external checkout is absent.');
    return;
  }

  const resultsPath = path.join(gaiaDir, 'gaia_results.json');
  const previousMtime = fs.existsSync(resultsPath) ? fs.statSync(resultsPath).mtimeMs : null;
  try {
    const stdout = runGaiaEvaluation(gaiaDir);
    if (stdout) console.log(stdout);
  } catch (err) {
    console.error('[GAIA] Evaluation execution failed:', err.message);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }

  const results = getGaiaResults(gaiaDir);
  assert.ok(results, 'GAIA results file not found');
  const resultsMtime = fs.statSync(resultsPath).mtimeMs;
  assert.ok(previousMtime === null || resultsMtime > previousMtime, 'GAIA results must be refreshed by this execution, not read from a stale artifact');
  assert.ok(results.summary, 'Summary block missing in results');

  console.log('\n--- Verification of GAIA Quality Thresholds ---');
  console.log(`  Total Tasks Evaluated : ${results.summary.total_tasks} (Target: 165)`);
  console.log(`  Total Passed Tasks    : ${results.summary.total_passed}`);
  console.log(`  Overall Accuracy      : ${results.summary.overall_accuracy}% (Threshold: >= 95.0%)`);
  console.log(`  Duration              : ${results.summary.duration_sec}s`);

  assert.strictEqual(results.summary.total_tasks, 165, 'Must evaluate 165 validation tasks');
  assert.ok(results.summary.overall_accuracy >= 95.0, 'Overall accuracy must be >= 95%');

  // Verify breakdown across levels
  verifyLevelAccuracy(results.by_level, 1, 53);
  verifyLevelAccuracy(results.by_level, 2, 86);
  verifyLevelAccuracy(results.by_level, 3, 26);

  console.log('\n[PASS] GAIA thresholds met for this recorded execution.');
  console.log('===============================================================\n');
}

runGaiaTestSuite().catch(err => {
  console.error('[FATAL] GAIA test runner failed:', err);
  process.exit(1);
});
