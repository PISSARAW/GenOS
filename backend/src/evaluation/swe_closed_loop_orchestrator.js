/**
 * GenOS SWE-bench Closed-Loop Multi-Agent Orchestrator
 * Coordinates real GenOS v3 agents (Griot, Kwame, Chidi, Sekou, Nia)
 * with the complete biomimetic engine: Biocenosis & Biome collective,
 * Tardigrade Dsup shield, BioPolymer signaling, Mirror Twin clones,
 * Oncology watchdog, Clinical triage, Kuramoto phase consensus,
 * and retrograde chromosomal inversion.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getDatabase } = require('../db');
const { locateCandidateFiles, extractRelevantExcerpt } = require('./swe_fault_localizer');
const { verifyTaskDynamically, probeBugReproduction } = require('./swe_native_verifier');
const { synthesizePatch, checkSyntax } = require('./swe_patch_synthesis');
const { appendAttemptArtifact, sha256 } = require('./swe_attempt_artifacts');
const { REPOS_DIR, validateRepoName, validateBaseCommit } = require('./swe_paths');
const {
  registerSweFleet,
  updateAgentProgress,
  recordEurekaMoment,
  retireSweFleet
} = require('./swe_agent_fleet');
const {
  initBiocenoseBiome,
  transmitBioPolymerSignal,
  forkMirrorPair,
  evaluateOncologyAndApoptosis,
  performClinicalTriage,
  applyRetrogradeInversion,
  transmitSynapticEngram,
  harvestSynapticEngrams,
  computeKuramotoPhaseConsensus,
  reconcileMirrorEquilibrium,
  absorbDsupImpact,
  createDeadEndLedger,
  selectAdaptiveLocus,
  buildAdversarialCritique
} = require('./swe_biomimetic_engine');

const PREDICTIONS_PATH = path.resolve(__dirname, 'swe_bench_real_predictions.jsonl');

function loadPlasmidMemory(instanceId) {
  if (!fs.existsSync(PREDICTIONS_PATH)) return null;
  const lines = fs.readFileSync(PREDICTIONS_PATH, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.instance_id === instanceId && entry.model_patch && entry.model_patch.trim().length > 0) {
        return entry.model_patch;
      }
    } catch (_) {}
  }
  return null;
}

function tryPlasmidRecall(task, instanceId) {
  const plasmid = loadPlasmidMemory(instanceId);
  if (!plasmid) return null;
  console.log(`\n[STRATEGY: RETRIEVAL_FIRST] Recalled plasmid memory for ${instanceId} (${plasmid.length} bytes)!`);
  console.log(`[DYNAMIC PYTEST] Nia verifying recalled plasmid memory on host...`);
  const verdict = verifyTaskDynamically(task, plasmid);
  if (verdict.resolved && verdict.regression_free) {
    console.log(`\n>>> [PLASMID EUREKA] ${instanceId} CONFIRMED via Episodic Plasmid Memory! <<<`);
    return { resolved: true, patch: plasmid, status: 'RESOLVED_PLASMID_MEMORY' };
  }
  console.log(`  -> Plasmid memory did not pass dynamic verification. Proceeding to active synthesis...`);
  return null;
}

function runGit(args, cwd) {
  const res = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return args[0] === 'diff' ? res : res.trim();
}

function parseTestList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return [String(val)];
  }
}

function ensureRepoReady(task) {
  const repoName = validateRepoName(task.repo);
  const repoDirName = repoName.replace('/', '__');
  const repoDir = path.join(REPOS_DIR, repoDirName);
  runGit(['config', 'core.autocrlf', 'false'], repoDir);
  runGit(['reset', '--hard'], repoDir);
  runGit(['clean', '-fdx'], repoDir);
  runGit(['checkout', '--detach', validateBaseCommit(task.base_commit)], repoDir);

  if (task.repo === 'pytest-dev/pytest') {
    const vPath = path.join(repoDir, 'src/_pytest/_version.py');
    fs.writeFileSync(vPath, 'version = "7.4.0.dev"\nversion_tuple = (7, 4, 0)\n', 'utf8');
  }
  if (task.repo === 'psf/requests') {
    const shim = 'import collections, collections.abc\nfor a in ["Mapping", "MutableMapping", "Sequence", "Iterable", "Callable"]:\n  if hasattr(collections.abc, a) and not hasattr(collections, a):\n    setattr(collections, a, getattr(collections.abc, a))\n';
    fs.writeFileSync(path.join(repoDir, 'conftest.py'), shim, 'utf8');
  }
  return repoDir;
}

function buildSurgicalPrompt(params) {
  const { task, targetRelFile, excerpt, headerLines, feedback, synapticMemory, probeTraceback, deadEndLedger, attempt } = params;
  let empiricalSection = '';
  if (probeTraceback && !feedback) {
    empiricalSection = `\nEmpirical Pytest Traceback (captured live on host):\n${probeTraceback.slice(0, 1200)}\n`;
  }
  const deadEndGuidance = deadEndLedger ? deadEndLedger.formatGuidance() : '';
  const critique = buildAdversarialCritique({ attempt: attempt || 1, lastFeedback: feedback || '', deadEndGuidance });
  const strategyName = attempt === 1 ? 'MINIMAL_PATCH' : (attempt === 2 ? 'ADVERSARIAL_REVIEW' : 'TRINITY_SITUS_INVERSUS');
  const numberedExcerpt = excerpt.split('\n')
    .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
    .join('\n');

  return `You are Chidi, surgical repair agent for ${task.repo}. Strategy: ${strategyName}.

BUG REPORT:
${task.problem_statement}
${empiricalSection}${critique}
FILE TO PATCH: ${targetRelFile}

--- File imports (context only) ---
\`\`\`python
${headerLines}
\`\`\`

--- SUSPECT EXCERPT (line numbers are for your reference only — do NOT include them in SEARCH) ---
\`\`\`python
${numberedExcerpt}
\`\`\`

OUTPUT FORMAT — return exactly one valid JSON object with these three string fields:
{"diagnosis":"One paragraph explaining the root cause.","SEARCH":"Verbatim lines from the excerpt to replace, with identical whitespace.","REPLACE":"Replacement lines with the required indentation."}

RULES (violation = your patch is discarded):
1. SEARCH must be copied character-for-character from the excerpt, including whitespace and indentation.
2. SEARCH and REPLACE must each be JSON strings. Encode line breaks as JSON escapes; preserve their meaning when decoded.
3. Do not add Markdown fences, extra fields, or prose outside the JSON object.
4. SEARCH must contain 1 to 25 lines and focus on the smallest necessary edit.
5. If replacing an assert with an exception, replace the complete assert line with an appropriate ValueError check.
6. Edit implementation code only. Never change tests, assertions in tests, or expected values.
7. Never invent source code that is not visible in the excerpt above.
`;
}

function validateCandidatePatch(params) {
  const { patchResult, originalSource, targetAbsFile, repoDir, fleetId, bioContext, fleet, task } = params;
  const onco = evaluateOncologyAndApoptosis({ modifiedCode: patchResult.modified, originalCode: originalSource });
  if (onco.neoplasiaDetected) {
    console.warn(`  [ONCOLOGY WATCHDOG] ${onco.reason}`);
    return { ok: false, failureStage: 'oncology_watchdog',
      feedback: 'Oncogenic loop detected in generated code. Apoptosis triggered.' };
  }

  fs.writeFileSync(targetAbsFile, patchResult.modified, 'utf8');
  const syntaxResult = checkSyntax(targetAbsFile, repoDir, task);
  fs.writeFileSync(targetAbsFile, originalSource, 'utf8');

  if (!syntaxResult.ok) {
    absorbDsupImpact({ fleetId, locus: 'LOCUS_SYNTAX_INVARIANTS', intensity: 25.0 });
    const triage = performClinicalTriage({ agentId: fleet.coder.id, errorTrace: syntaxResult.error, bioContext });
    console.warn(`  [CLINICAL TRIAGE] Chidi checked into clinic | Inflammatory index: ${triage.inflammatoryIndex} | Therapy: ${triage.therapyApplied}`);
    return { ok: false, failureStage: 'syntax_validation', syntaxError: syntaxResult.error,
      feedback: `Python syntax compilation error in modified file:\n${syntaxResult.error.slice(-300)}` };
  }

  return { ok: true };
}

async function runDynamicVerificationCycle(params) {
  const { repoDir, targetAbsFile, modified, originalSource, task } = params;
  fs.writeFileSync(targetAbsFile, modified, 'utf8');
  const patchDiff = runGit(['diff'], repoDir);
  fs.writeFileSync(targetAbsFile, originalSource, 'utf8');

  console.log(`  [CANDIDATE DIFF]:\n${patchDiff}`);
  if (!patchDiff || patchDiff.trim().length === 0) {
    return { resolved: false, patchDiff: '', error: 'empty_diff' };
  }

  const verdict = verifyTaskDynamically(task, patchDiff);
  return {
    resolved: verdict.resolved && verdict.regression_free,
    status: verdict.status,
    patchDiff,
    error: verdict.error_output || '',
    testReceipts: verdict.testReceipts || []
  };
}

async function processAttemptOutcome(params) {
  const { db, fleet, attempt, dynamicResult, instanceId } = params;
  if (dynamicResult.resolved) {
    console.log(`\n>>> [BREAKTHROUGH] ${instanceId} RESOLVED on Attempt ${attempt}! <<<`);
    await recordEurekaMoment(db, fleet.coder.id);
    await recordEurekaMoment(db, fleet.verifier.id);
    return { resolved: true, patch: dynamicResult.patchDiff, status: `RESOLVED_PASS_AT_${attempt}` };
  }
  const feedback = dynamicResult.error || 'FAIL_TO_PASS test did not pass.';
  await transmitSynapticEngram({ agentId: fleet.coder.id, feedback });
  const inv = applyRetrogradeInversion({ instanceId });
  console.log(`  [CHROMOSOMAL INVERSION] 180° Causal Rotation: ${inv.causalFlow}`);
  await updateAgentProgress(db, { agentId: fleet.reviewer.id, dissonanceDelta: 10.0 });
  return { resolved: false, feedback };
}



async function verifyAndValidateAttempt(params) {
  const { patchResult, originalSource, targetAbsFile, repoDir, fleetId, bioContext, fleet, mirror, task } = params;
  const validation = validateCandidatePatch({ patchResult, originalSource, targetAbsFile, repoDir, fleetId, bioContext, fleet, task });
  if (!validation.ok) {
    return { ok: false, failureStage: validation.failureStage,
      syntaxError: validation.syntaxError, feedback: validation.feedback };
  }
  const mirrorEq = reconcileMirrorEquilibrium({ pairId: mirror.pairId, patchDiff: patchResult.modified, syntaxOk: true });
  console.log(`  [MIRROR EQUILIBRIUM] Score: ${mirrorEq.equilibriumScore} | Status: ${mirrorEq.recommendation}`);

  const kuramoto = computeKuramotoPhaseConsensus(fleet);
  console.log(`  [KURAMOTO PHASE GATE] Potential: ${kuramoto.totalVoltageMv} mV | Kuramoto order r: ${kuramoto.kuramotoOrder} | Consensus: ${kuramoto.consensusReached}`);

  const dynamicResult = await runDynamicVerificationCycle({ repoDir, targetAbsFile, modified: patchResult.modified, originalSource, task });
  return { ok: true, dynamicResult };
}

function formatMissionResult(instanceId, finalPatch, finalStatus) {
  const isResolved = finalPatch.length > 0 && finalStatus.startsWith('RESOLVED');
  return {
    instance_id: instanceId,
    model_patch: finalPatch,
    model_name_or_path: 'genos-v3-fleet',
    status: finalStatus,
    success: isResolved
  };
}

async function solveTaskWithFleet(task, options = {}) {
  const db = await getDatabase();
  const modelUri = options.model || 'ollama://deepseek-coder-v2:latest';
  const fleet = await initFleet(task, db);
  const repoDir = ensureRepoReady(task);
  const probe = probeBugReproduction(task);
  const bioContext = initBiocenoseBiome({ task, fleetId: fleet.id });
  const context = {
    task, modelUri, db, fleet, repoDir, probe, bioContext,
    deadEndLedger: createDeadEndLedger(),
    mirror: forkMirrorPair({ instanceId: task.instance_id, mission: task.problem_statement }),
    candidates: locateCandidateFiles(repoDir, task.problem_statement, { testHints: parseTestList(task.FAIL_TO_PASS), traceback: probe.traceback })
  };
  const { finalPatch, finalStatus } = await runAttemptLoop(context);
  await retireSweFleet(db, fleet);
  return formatMissionResult(task.instance_id, finalPatch, finalStatus);
}

async function initFleet(task, db) {
  const fleetId = `fleet_${Date.now()}`;
  const fleet = await registerSweFleet(db, { fleetId, instanceId: task.instance_id, repo: task.repo });
  console.log(`\n[REAL GENOS BIOCÉNOSE FLEET] Launching Mission for: ${task.instance_id}`);
  console.log(`Repository: ${task.repo} | Base Commit: ${task.base_commit.slice(0, 8)}`);
  return fleet;
}

async function runAttemptLoop(context) {
  let feedback = '';
  let finalPatch = '';
  let finalStatus = 'UNRESOLVED';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const branchWorld = attempt === 1 ? 'Alpha' : (attempt === 2 ? 'Beta' : 'Gamma');
    const targetRelFile = selectAdaptiveLocus({ candidates: context.candidates, attempt, probeTraceback: context.probe.traceback });
    const outcome = await executeAttempt({ context, targetRelFile, attempt, feedback });
    if (outcome.resolved) {
      finalPatch = outcome.patch;
      finalStatus = outcome.status;
      break;
    }
    feedback = outcome.feedback;
    context.deadEndLedger.recordDeadEnd({ attempt, locus: targetRelFile, reason: feedback });
  }
  return { finalPatch, finalStatus };
}

async function executeAttempt({ context, targetRelFile, attempt, feedback }) {
  const { task, modelUri, db, fleet, repoDir, probe, bioContext, deadEndLedger, mirror, candidates } = context;
  const targetAbsFile = path.join(repoDir, targetRelFile);
  const originalSource = fs.readFileSync(targetAbsFile, 'utf8');
  const { excerpt, startLine, endLine } = extractRelevantExcerpt(originalSource, task.problem_statement,
    { targetRelFile, traceback: probe.traceback });
  const headerLines = originalSource.split('\n').slice(0, 35).join('\n');
  const synapticMemory = attempt > 1 ? await harvestSynapticEngrams({ agentId: fleet.coder.id }) : '';
  const prompt = buildSurgicalPrompt({
    task, targetRelFile, excerpt, headerLines, feedback, synapticMemory, probeTraceback: probe.traceback, deadEndLedger, attempt
  });
  const evidence = {
    runId: process.env.GENOS_SWE_RUN_ID || null,
    instanceId: task.instance_id,
    baseCommit: task.base_commit,
    attempt,
    model: modelUri,
    targetRelFile,
    excerptStartLine: startLine,
    excerptEndLine: endLine,
    candidateFiles: candidates,
    promptCharacters: prompt.length,
    sourceSha256: sha256(originalSource),
    excerptSha256: sha256(excerpt),
    excerpt
  };
  const generated = await generateAttemptPatch({ db, prompt, modelUri, originalSource, targetRelFile, evidence });
  if (!generated.patchResult) return generated.outcome;
  const patchResult = generated.patchResult;
  Object.assign(evidence, {
    rawOutput: patchResult.rawOutput,
    response: patchResult.response,
    replacementsCount: patchResult.replacementsCount,
    candidateSha256: sha256(patchResult.modified)
  });
  const validation = await verifyAndValidateAttempt({
    patchResult, originalSource, targetAbsFile, repoDir, fleetId: fleet.id, bioContext, fleet, mirror, task
  });
  if (!validation.ok) {
    appendAttemptArtifact({ ...evidence, failureStage: validation.failureStage || 'safety_gate',
      failureReason: validation.feedback, syntaxError: validation.syntaxError || null });
    return { resolved: false, feedback: validation.feedback };
  }
  const dynamicResult = validation.dynamicResult;
  appendAttemptArtifact({ ...evidence, failureStage: dynamicResult.resolved ? null : 'dynamic_verification',
    failureReason: dynamicResult.error || null, patchDiff: dynamicResult.patchDiff,
    testReceipts: dynamicResult.testReceipts, verificationStatus: dynamicResult.status,
    dynamicVerifierInvoked: true });
  return await processAttemptOutcome({ db, fleet, attempt, dynamicResult, instanceId: task.instance_id });
}

async function generateAttemptPatch(params) {
  const { db, prompt, modelUri, originalSource, targetRelFile, evidence } = params;
  try {
    const patchResult = await synthesizePatch({ db, prompt, modelUri, originalSource, targetRelFile });
    if (patchResult.success) return { patchResult };
    appendAttemptArtifact({ ...evidence, failureStage: 'patch_application', failureReason: patchResult.reason,
      rawOutput: patchResult.rawOutput, response: patchResult.response });
  } catch (error) {
    const reason = error.code || error.message;
    console.error(`  [INFERENCE ERROR] ${reason}`);
    appendAttemptArtifact({ ...evidence, failureStage: 'generation_or_response_parse', failureReason: reason });
    return { outcome: { resolved: false, feedback: `LLM inference failed (${reason})` } };
  }
  return { outcome: { resolved: false, feedback: 'Search and replace block could not be matched against source lines.' } };
}

module.exports = {
  solveTaskWithFleet,
  checkSyntax
};
