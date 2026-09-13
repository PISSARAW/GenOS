/**
 * GenOS Native SWE-bench Autonomous Evaluation Engine
 * Harness connecting SWE-bench tasks to the GenOS Autonomy Core:
 * - autonomousOrchestrationService (7-phase Autonomy Plan & Mirror Twins)
 * - strategyRegistry (Biomimicry & Resilience strategies)
 * - vfsSandboxService (Pre-flight Blast Radius & Quantum VFS)
 * - modelRouter (Local Multi-LLM inference via Ollama)
 * - agentEvidenceService (Evidence Barrier & Proof Gate)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildAutonomyPlan } = require('../services/autonomousOrchestrationService');
const { listStrategies } = require('../strategies/strategyRegistry');
const vfsSandbox = require('../services/vfsSandboxService');
const { generate } = require('../services/modelRouter');
const { getDatabase } = require('../db');
const { locateCandidateFiles, extractRelevantExcerpt } = require('./swe_fault_localizer');
const { applySearchReplace } = require('./swe_surgical_patcher');

const SWE_DATA_PATH = path.resolve(__dirname, '../../../../SWE-bench/swe_bench_lite_tasks.json');
const REPOS_DIR = path.resolve(__dirname, '../../../../.genos-agent-worlds/swe_repos');

function runGit(cmd, cwd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ensureRepoCloned(repoName) {
  if (!fs.existsSync(REPOS_DIR)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
  }

  const repoDirName = repoName.replace('/', '__');
  const targetDir = path.join(REPOS_DIR, repoDirName);

  if (!fs.existsSync(path.join(targetDir, '.git'))) {
    console.log(`[VFS PROVISION] Cloning ${repoName} into isolated world: ${targetDir}...`);
    const repoUrl = `https://github.com/${repoName}.git`;
    execSync(`git clone ${repoUrl} ${targetDir}`, { stdio: 'inherit' });
  }

  return targetDir;
}

function prepareWorkspace(repoDir, baseCommit) {
  runGit('reset --hard', repoDir);
  runGit('clean -fdx', repoDir);
  runGit(`checkout ${baseCommit}`, repoDir);
  console.log(`[VFS WORKSPACE] Workspace isolated and checked out at base_commit: ${baseCommit.slice(0, 8)}`);
}

function buildContractForTask(task) {
  return {
    mission_id: `swe_mission_${task.instance_id.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    description: task.problem_statement,
    problem_profile: {
      risk: 'high',
      complexity: 0.85,
      uncertainty: 0.70,
      type: 'code_repair'
    },
    strategy_portfolio: listStrategies(),
    branches: [
      { label: 'Hypothesis Optimistic', hypothesis: 'Direct minimal repair at root cause' },
      { label: 'Hypothesis Skeptic', hypothesis: 'Adversarial edge-case review & regression testing' }
    ]
  };
}

function buildPrompt(params) {
  const { task, targetRelFile, headerLines, excerpt } = params;
  return `You are an expert software engineer fixing a bug in repository ${task.repo}.

Problem Description:
${task.problem_statement}

Target File to Modify: ${targetRelFile}

File Header & Imports:
\`\`\`python
${headerLines}
\`\`\`

Suspect Code Excerpt:
\`\`\`python
${excerpt}
\`\`\`

Instructions:
1. Analyze the bug and the suspect excerpt carefully.
2. Provide the minimal surgical fix using a SEARCH/REPLACE block.
3. In the SEARCH section, provide the exact lines from the suspect excerpt in the original file.
4. In the REPLACE section, provide the corrected replacement lines.
5. Use existing imported utilities or add necessary imports if applicable.
6. Do NOT write any conversational explanation, markdown chat, or thoughts before the block. Start IMMEDIATELY with the SEARCH/REPLACE block.

Format required:
<<<<<<< SEARCH
exact lines to replace from original file
=======
corrected replacement lines
>>>>>>>
`;
}

async function solveSweTask(task, options = {}) {
  const modelUri = options.model || 'ollama://qwen2.5-coder:7b';
  const instanceId = task.instance_id;
  console.log(`\n======================================================================`);
  console.log(`[GENOS SWE-BENCH] Processing Task: ${instanceId}`);
  console.log(`Repository: ${task.repo} | Base Commit: ${task.base_commit.slice(0, 8)}`);
  console.log(`======================================================================`);

  // --- PHASE 1: ORCHESTRATION PLANNING (autonomousOrchestrationService) ---
  console.log(`\n[PHASE 1] Building GenOS Autonomy Plan for ${instanceId}...`);
  const contract = buildContractForTask(task);
  const autonomyPlan = buildAutonomyPlan(contract, { tokens: 100000 });
  console.log(`  -> GenOS Autonomy Plan generated: ${autonomyPlan.phases.length} phases.`);
  console.log(`  -> Deployed Specialist Workers: ${autonomyPlan.workers.map(w => `${w.label} (${w.role})`).join(', ')}`);

  // --- PHASE 2: WORKSPACE & VFS PROVISIONING ---
  console.log(`\n[PHASE 2] Provisioning Isolated VFS Workspace...`);
  const repoDir = ensureRepoCloned(task.repo);
  prepareWorkspace(repoDir, task.base_commit);

  // --- PHASE 3: FAULT LOCALIZATION ---
  console.log(`\n[PHASE 3] Running Fault Localization...`);
  const candidateFiles = locateCandidateFiles(repoDir, task.problem_statement);
  console.log(`  -> Identified Candidate Target Files:`, candidateFiles);

  const targetRelFile = candidateFiles[0] || 'setup.py';
  const targetAbsFile = path.join(repoDir, targetRelFile);
  const originalSource = fs.readFileSync(targetAbsFile, 'utf8');

  const { excerpt, startLine, endLine } = extractRelevantExcerpt(originalSource, task.problem_statement, targetRelFile);
  const fileLines = originalSource.split('\n');
  const headerLines = fileLines.slice(0, Math.min(40, fileLines.length)).join('\n');
  console.log(`  -> Suspect region localized in ${targetRelFile} (lines ${startLine}-${endLine}).`);

  // --- PHASE 4: AUTONOMOUS WORKER SURGICAL MUTATION (modelRouter) ---
  console.log(`\n[PHASE 4] Synthesizing Surgical Repair via NER Excision for ${targetRelFile}...`);
  const prompt = buildPrompt({ task, targetRelFile, headerLines, excerpt });

  const db = await getDatabase();
  const genResult = await generate({
    prompt,
    model: modelUri,
    priority: 'interactive',
    timeoutMs: 90000,
    maxTokens: 1024,
    db
  });

  const rawOutput = genResult.text || '';
  const { modified, replacementsCount } = applySearchReplace(originalSource, rawOutput);

  if (replacementsCount === 0) {
    console.warn(`  [WARN] Search/replace block could not be matched against ${targetRelFile}.`);
    return { instance_id: instanceId, model_patch: '', model_name_or_path: 'genos-v3', success: false };
  }

  // --- PHASE 5: PRE-FLIGHT BLAST RADIUS & VFS SIMULATION ---
  console.log(`\n[PHASE 5] Simulating Pre-Flight Blast Radius in VFS...`);
  const initialVfs = { [targetRelFile]: originalSource };
  const dryRun = vfsSandbox.simulateDryRun('genos_write', { path: targetRelFile, content: modified }, initialVfs);
  const blastScore = vfsSandbox.calculateBlastRadius(dryRun.sideEffects.filesModified.length, false, 'operator');
  console.log(`  -> VFS Dry-Run: ${dryRun.sideEffects.filesModified.length} file(s) modified. Blast Radius Score: ${blastScore}/100.`);

  // --- PHASE 6: WRITE REPAIR & VERIFY EVIDENCE GATE ---
  console.log(`\n[PHASE 6] Applying Mutation & Running Evidence Verification...`);
  fs.writeFileSync(targetAbsFile, modified, 'utf8');

  let syntaxValid = false;
  try {
    execSync(`python -m py_compile ${targetAbsFile}`, { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] });
    syntaxValid = true;
    console.log(`  [EVIDENCE GATE] Python Syntax Compilation: PASSED (Zero syntax errors).`);
  } catch (err) {
    console.warn(`  [EVIDENCE GATE] Python Syntax Error: Reverting file.`);
    fs.writeFileSync(targetAbsFile, originalSource, 'utf8');
  }

  // --- PHASE 7: EXTRACT UNIFIED DIFF PATCH ---
  console.log(`\n[PHASE 7] Extracting Formal Unified Diff Patch...`);
  const diff = runGit('diff', repoDir);
  console.log(`  -> Patch Size: ${diff.length} bytes.`);

  return {
    instance_id: instanceId,
    model_patch: diff,
    model_name_or_path: 'genos-v3',
    success: diff.length > 0 && syntaxValid,
    blast_score: blastScore
  };
}

function filterTasks(tasks, options) {
  let targetTasks = tasks;
  if (options.instance) {
    targetTasks = targetTasks.filter(t => t.instance_id === options.instance);
  }
  if (options.repo) {
    targetTasks = targetTasks.filter(t => t.repo === options.repo);
  }
  if (options.limit && parseInt(options.limit, 10) > 0) {
    targetTasks = targetTasks.slice(0, parseInt(options.limit, 10));
  }
  return targetTasks;
}

async function runSweEvaluation(options = {}) {
  const modelUri = options.model || 'ollama://qwen2.5-coder:7b';
  const outFile = options.outFile || path.resolve(__dirname, 'swe_bench_real_predictions.jsonl');

  if (!fs.existsSync(SWE_DATA_PATH)) {
    throw new Error(`SWE-bench Lite dataset not found at ${SWE_DATA_PATH}`);
  }

  const tasks = JSON.parse(fs.readFileSync(SWE_DATA_PATH, 'utf8'));
  const targetTasks = filterTasks(tasks, options);

  if (!targetTasks.length) {
    throw new Error(`No matching tasks found in SWE-bench dataset.`);
  }

  console.log(`Total Tasks Queued for Autonomous Repair: ${targetTasks.length}`);
  const predictions = [];
  let successfulPatches = 0;

  for (let i = 0; i < targetTasks.length; i++) {
    const task = targetTasks[i];
    console.log(`\n>>> Progress: [${i + 1}/${targetTasks.length}] - ${task.instance_id}`);
    try {
      const result = await solveSweTask(task, { model: modelUri });
      predictions.push(result);
      if (result.success) successfulPatches++;

      const benchEntry = {
        instance_id: result.instance_id,
        model_patch: result.model_patch,
        model_name_or_path: result.model_name_or_path
      };
      fs.appendFileSync(outFile, JSON.stringify(benchEntry) + '\n', 'utf8');
    } catch (err) {
      console.error(`[ERROR] Failed on ${task.instance_id}:`, err.message);
    }
  }

  console.log(`\n======================================================================`);
  console.log(`=== SWE-bench Autonomous Evaluation Batch Completed ===`);
  console.log(`Total Tasks: ${targetTasks.length}`);
  console.log(`Valid Surgical Patches: ${successfulPatches}/${targetTasks.length} (${((successfulPatches / targetTasks.length) * 100).toFixed(1)}%)`);
  console.log(`======================================================================\n`);

  return predictions;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback = null) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const options = {
    model: getArg('--model', 'ollama://qwen2.5-coder:7b'),
    instance: getArg('--instance', null),
    repo: getArg('--repo', null),
    limit: getArg('--limit', null),
    outFile: getArg('--out-file', null)
  };

  runSweEvaluation(options).catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}

module.exports = { runSweEvaluation, solveSweTask };
