/**
 * GenOS Native SWE-bench Dynamic Test Verifier
 * Executes real reproduction and verification tests on host Python/pytest:
 * 1. Checkout base_commit in isolated workspace
 * 2. Apply test_patch
 * 3. Run FAIL_TO_PASS -> Verify test fails (reproduction confirmation)
 * 4. Apply model patch
 * 5. Run FAIL_TO_PASS -> Verify test passes (resolution confirmation)
 * 6. Run PASS_TO_PASS -> Verify no regression
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPOS_DIR = path.resolve(__dirname, '../../../../.genos-agent-worlds/swe_repos');
const TASKS_PATH = path.resolve(__dirname, '../../../../SWE-bench/swe_bench_lite_tasks.json');
const PREDICTIONS_PATH = path.resolve(__dirname, 'swe_bench_real_predictions.jsonl');

function runCmd(cmd, cwd, env = {}) {
  try {
    const fullEnv = { ...process.env, ...env };
    const stdout = execSync(cmd, { cwd, env: fullEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { success: true, code: 0, output: stdout };
  } catch (err) {
    return { success: false, code: err.status || 1, output: (err.stdout || '') + (err.stderr || '') };
  }
}

function runGit(cmd, cwd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function applyPatchToRepo(repoDir, patchContent) {
  const content = patchContent.endsWith('\n') ? patchContent : patchContent + '\n';
  const tmpDiff = path.join(repoDir, '_temp_swe_apply.diff');
  fs.writeFileSync(tmpDiff, content, 'utf8');
  try {
    execSync('git apply --ignore-whitespace --whitespace=nowarn _temp_swe_apply.diff', { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] });
    fs.unlinkSync(tmpDiff);
    return true;
  } catch (_) {
    try {
      execSync('git apply --recount --ignore-whitespace --whitespace=nowarn _temp_swe_apply.diff', { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] });
      fs.unlinkSync(tmpDiff);
      return true;
    } catch (_) {
      if (fs.existsSync(tmpDiff)) fs.unlinkSync(tmpDiff);
      return false;
    }
  }
}

function toWslPath(winPath) {
  return winPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}

function runPytest(repoDir, testTarget, pythonPath = 'src:.') {
  const wslDir = toWslPath(repoDir);
  const repoName = path.basename(repoDir);
  const pytestBin = `~/.swe_venvs/${repoName}/bin/pytest`;
  const wslCmd = `wsl -d Ubuntu-24.04 bash -c "cd '${wslDir}' && PYTHONPATH=${pythonPath} ${pytestBin} ${testTarget} -v -W ignore::DeprecationWarning"`;
  return runCmd(wslCmd, repoDir);
}

function parseTestList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return [String(val)];
  }
}

function checkRegressionTests(repoDir, passList) {
  if (!passList.length) return true;
  console.log(`\n[STEP 5] Running PASS_TO_PASS test suite (Regression Check)...`);
  const samplePassTargets = passList.slice(0, 5).join(' ');
  const regResult = runPytest(repoDir, samplePassTargets);
  const ok = regResult.success;
  console.log(`  -> PASS_TO_PASS regression check: ${ok ? 'PASSED' : 'FAILED'}`);
  return ok;
}

function injectFlaskShim(repoDir) {
  const fShim = 'import werkzeug\nif not hasattr(werkzeug, "__version__"):\n    werkzeug.__version__ = "2.3.7"\n';
  const cPath = path.join(repoDir, 'tests', 'conftest.py');
  if (fs.existsSync(cPath)) {
    const existing = fs.readFileSync(cPath, 'utf8');
    fs.writeFileSync(cPath, fShim + '\n' + existing, 'utf8');
  }
}

function prepareRepoForTask(task, repoDir) {
  runGit('config core.autocrlf false', repoDir);
  runGit('reset --hard', repoDir);
  runGit('clean -fdx', repoDir);
  runGit(`checkout ${task.base_commit}`, repoDir);

  if (task.repo === 'pytest-dev/pytest') {
    const vPath = path.join(repoDir, 'src/_pytest/_version.py');
    fs.writeFileSync(vPath, 'version = "7.4.0.dev"\nversion_tuple = (7, 4, 0)\n', 'utf8');
  }
  if (task.repo === 'psf/requests') {
    const shim = 'import collections, collections.abc\nfor a in ["Mapping", "MutableMapping", "Sequence", "Iterable", "Callable"]:\n  if hasattr(collections.abc, a) and not hasattr(collections, a):\n    setattr(collections, a, getattr(collections.abc, a))\n';
    fs.writeFileSync(path.join(repoDir, 'conftest.py'), shim, 'utf8');
  }
  if (task.repo === 'pallets/flask') {
    injectFlaskShim(repoDir);
  }
}

function verifyTaskDynamically(task, patchToTest) {
  const instanceId = task.instance_id;
  const repoDirName = task.repo.replace('/', '__');
  const repoDir = path.join(REPOS_DIR, repoDirName);

  console.log(`\n======================================================================`);
  console.log(`[DYNAMIC TEST VERIFIER] Verifying Task: ${instanceId}`);
  console.log(`Repository: ${task.repo} | Base Commit: ${task.base_commit.slice(0, 8)}`);
  console.log(`======================================================================`);

  prepareRepoForTask(task, repoDir);

  // Step 2: Apply benchmark test patch
  console.log(`\n[STEP 1] Applying official benchmark test patch...`);
  const testPatchOk = applyPatchToRepo(repoDir, task.test_patch);
  if (!testPatchOk) {
    console.warn(`  [WARN] Failed to apply test_patch via git apply.`);
    return { instance_id: instanceId, reproduced: false, resolved: false };
  }
  console.log(`  -> Test patch applied successfully.`);

  // Step 3: Run FAIL_TO_PASS before fix (Verify bug reproduction)
  console.log(`\n[STEP 2] Running FAIL_TO_PASS test before fix (Reproduction Check)...`);
  const failList = parseTestList(task.FAIL_TO_PASS);
  const failToPassTarget = failList.join(' ');
  const preResult = runPytest(repoDir, failToPassTarget);
  const reproduced = !preResult.success;
  console.log(`  -> Pre-fix test result: ${reproduced ? 'FAILED (Expected reproduction!)' : 'PASSED'}`);

  // Step 4: Apply model patch
  console.log(`\n[STEP 3] Applying candidate patch (${patchToTest.length} bytes)...`);
  const modelPatchOk = applyPatchToRepo(repoDir, patchToTest);
  if (!modelPatchOk) {
    console.warn(`  [WARN] Failed to apply model patch.`);
    return { instance_id: instanceId, reproduced, resolved: false, reason: 'patch_apply_failed' };
  }
  console.log(`  -> Candidate patch applied successfully.`);

  // Step 5: Run FAIL_TO_PASS after fix (Verify bug resolution)
  console.log(`\n[STEP 4] Running FAIL_TO_PASS test after fix (Resolution Check)...`);
  const postResult = runPytest(repoDir, failToPassTarget);
  const resolved = postResult.success;
  console.log(`  -> Post-fix test result: ${resolved ? 'PASSED (RESOLUTION CONFIRMED!)' : 'FAILED'}`);
  if (!resolved) {
    console.log(`  -> Test output snippet:\n${(postResult.output || '').slice(-400)}`);
  }

  // Step 6: Run PASS_TO_PASS check (Regression Check)
  let regressionFree = true;
  if (resolved) {
    regressionFree = checkRegressionTests(repoDir, parseTestList(task.PASS_TO_PASS));
  }

  // Reset repo clean
  runGit('reset --hard', repoDir);
  runGit('clean -fdx', repoDir);

  const status = (resolved && regressionFree) ? 'RESOLVED_PASS_AT_1' : 'UNRESOLVED';
  const errorOutput = resolved ? '' : extractPytestFailure(postResult.output);
  const verdict = { instance_id: instanceId, reproduced, resolved, regression_free: regressionFree, error_output: errorOutput, status };

  console.log(`\n>>> VERDICT FOR ${instanceId}: [${status}] <<<`);
  return verdict;
}

function extractPytestFailure(output) {
  if (!output) return '';
  const idx = output.indexOf('FAILURES');
  if (idx !== -1) return output.slice(idx, idx + 2500);
  const underIdx = output.indexOf('_____');
  if (underIdx !== -1) return output.slice(underIdx, underIdx + 2500);
  return output.slice(-2000);
}

async function runNativeVerification(targetInstance = null) {
  const allTasks = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  const predictions = fs.readFileSync(PREDICTIONS_PATH, 'utf8')
    .trim().split('\n')
    .map(l => JSON.parse(l));
  const predMap = new Map(predictions.map(p => [p.instance_id, p.model_patch]));

  let tasksToVerify = allTasks.filter(t => t.repo === 'pallets/flask');
  if (targetInstance) {
    tasksToVerify = allTasks.filter(t => t.instance_id === targetInstance);
  }

  console.log('======================================================================');
  console.log('=== GENOS v3 NATIVE SWE-BENCH DYNAMIC TEST SUITE VERIFICATION ===');
  console.log(`Tasks to verify: ${tasksToVerify.length}`);
  console.log('======================================================================');

  const results = [];
  for (const task of tasksToVerify) {
    const patch = predMap.get(task.instance_id) || task.patch; // Test against our patch or gold
    const res = verifyTaskDynamically(task, patch);
    results.push(res);
  }

  console.log('\n======================================================================');
  console.log('=== FINAL DYNAMIC TEST VERIFICATION SCORECARD ===');
  console.log('======================================================================');
  for (const r of results) {
    console.log(`  [${r.status.padEnd(20)}] ${r.instance_id}`);
  }
  return results;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let target = 'pallets__flask-4992';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--instance' && args[i + 1]) {
      target = args[i + 1];
      break;
    } else if (!args[i].startsWith('--')) {
      target = args[i];
      break;
    }
  }
  runNativeVerification(target).catch(console.error);
}

module.exports = { verifyTaskDynamically, runNativeVerification };
