'use strict';

// Campagne de changement de regime a mi-mission (Qwen + orchestrateur GenOS).
// Stage training : selectionne la topologie figee par famille.
// Stage confirmatory : 30 taches holdout x 3 conditions, ordre randomise.
// Usage: node benchmarks/topology-morphogenesis/run-regime-change-campaign.cjs --stage all --output D:\GenOS-campaigns [--claim pilot]
// --claim confirmatory est refuse tant que le garde de qualification n'est pas satisfait (plan actuel : pilote).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { executeCondition } = require('./comparisonAdapters.cjs');
const { verifyRegimeCandidate } = require('./holdout-oracles/regime-change-oracles.cjs');
const { compareAgainst } = require('./regime-change-analysis.cjs');
const { qualifyRegimePlan, assertConfirmatory } = require('./regime-change-qualification.cjs');

const root = __dirname;
const repo = path.resolve(root, '../..');

function parseArgs(args) {
  const options = { stage: 'all', output: null, claim: 'pilot' };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--stage') options.stage = args[++i];
    else if (args[i] === '--output') options.output = args[++i];
    else if (args[i] === '--claim') options.claim = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!['all', 'training', 'confirmatory'].includes(options.stage)) throw new Error('Stage must be all, training or confirmatory.');
  if (!['pilot', 'confirmatory'].includes(options.claim)) throw new Error('Claim must be pilot or confirmatory.');
  return options;
}

function shaOf(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadInputs() {
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'regime-change-plan.json'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(root, plan.taskSetFile), 'utf8'));
  return { plan, data };
}

function verifyFrozen(plan, data) {
  if (shaOf(path.join(root, plan.taskSetFile)) !== plan.taskSetSha256) throw new Error('Task set digest mismatch: regenerate or re-freeze the plan.');
  if (shaOf(path.join(root, plan.oracleModule)) !== plan.oracleSha256) throw new Error('Oracle module digest mismatch.');
  const holdout = data.tasks.filter((t) => t.split === 'holdout');
  if (holdout.length !== plan.holdoutTaskIds) throw new Error('Holdout count mismatch.');
  for (const task of holdout) {
    if (!task.prompt || !task.oracle || !task.oracleParams || !task.adaptedTopology || !task.wrongTopology) {
      throw new Error(`Holdout task not fully pre-registered: ${task.id}`);
    }
  }
}

async function checkModel(plan) {
  const response = await fetch('http://127.0.0.1:11434/api/tags');
  if (!response.ok) throw new Error('Ollama endpoint unreachable.');
  const body = await response.json();
  const names = (body.models || []).map((m) => String(m.name || m.model || ''));
  if (!names.some((n) => n === plan.model || n.startsWith(`${plan.model}:`))) {
    throw new Error(`Model ${plan.model} not present in Ollama.`);
  }
  return names;
}

function freezeRecord(runDir, plan) {
  let head = 'unknown';
  let status = 'unknown';
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
  } catch { /* provenance best-effort */ }
  const record = { head, status, planSha: shaOf(path.join(root, 'regime-change-plan.json')),
    adaptersSha: shaOf(path.join(root, 'comparisonAdapters.cjs')), recordedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(runDir, 'freeze.json'), JSON.stringify(record, null, 2));
  return record;
}

function isolate(runDir, label) {
  const base = path.join(runDir, 'attempts', label);
  const workspace = path.join(base, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  return { workspace, dbPath: path.join(base, 'mission.db') };
}

function shuffle(values, seed) {
  let state = seed >>> 0;
  const rand = () => {
    state += 0x6D2B79F5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function attestationOf(result) {
  const receipt = result.receipt || {};
  const telemetry = Array.isArray(receipt.telemetry) ? receipt.telemetry : [];
  const text = JSON.stringify({ evidence: result.transitionEvidence,
    sample: telemetry.slice(0, 50) }).slice(0, 200000);
  return { transitionId: result.transitionEvidence?.transitionId || null,
    hasDiagnostic: /MORPHOGENESIS|diagnos|evidence/i.test(text),
    hasAdmission: /admission/i.test(text),
    workerCount: result.transitionEvidence?.workerCount ?? null };
}

function assessAttempt(input) {
  const { result, task, condition, seed, plan, model } = input;
  const oracle = result.candidate ? verifyRegimeCandidate(task, result.candidate)
    : { passed: false, reason: 'no-parseable-candidate' };
  const budgetOk = Number.isFinite(result.tokenUsage?.total)
    && result.tokenUsage.total <= plan.executionBudget.tokens
    && result.latencyMs <= plan.executionBudget.latencyMs;
  return { conditionId: condition.id, taskId: task.id, family: task.family, seed,
    requestedModel: model, topology: condition.topology || null, candidate: result.candidate, parsePassed: result.parsePassed,
    oraclePassed: oracle.passed === true, oracleReason: oracle.reason || null,
    tokenUsage: result.tokenUsage, latencyMs: result.latencyMs, servedModel: result.servedModel,
    servedModelOk: result.servedModel === model, toolUseCount: result.toolUseCount,
    budgetOk, error: result.error || null, attestation: attestationOf(result),
    receipt: result.receipt };
}

async function runOne(input) {
  const { condition, task, seed, runDir, plan, model, label } = input;
  const isolated = isolate(runDir, label);
  const context = { tokens: plan.executionBudget.tokens, latencyMs: plan.executionBudget.latencyMs,
    minimumWorkerTokens: plan.executionBudget.minimumWorkerTokens,
    workerShare: plan.executionBudget.workerShare, model, seed, ...isolated };
  const started = new Date().toISOString();
  let result;
  try {
    result = await executeCondition(condition, task, context);
  } catch (error) {
    result = { candidate: null, parsePassed: false, error: error.message, tokenUsage: {}, servedModel: null };
  }
  return { ...assessAttempt({ result, task, condition, seed, plan, model }), startedAt: started };
}

async function runJobs(input) {
  const { jobs, runDir, plan, model } = input;
  const attempts = [];
  for (const job of jobs) {
    const label = `${job.task.id}-${job.seed}-${job.condition.id}`;
    attempts.push(await runOne({ ...job, runDir, plan, model, label }));
    fs.writeFileSync(path.join(runDir, 'attempts.json'), JSON.stringify(attempts, null, 2));
  }
  return attempts;
}

function trainingJobs(plan, data) {
  const jobs = [];
  const tasks = data.tasks.filter((t) => t.split === 'training');
  for (const task of tasks) {
    for (const topology of plan.training.candidateTopologies) {
      const condition = { id: 'training-fixed', adapter: 'genos-full', autonomous: true,
        topology, morphogenesisPolicy: { adaptive: false } };
      jobs.push({ condition, task, seed: plan.training.seeds[0] });
    }
  }
  return shuffle(jobs, plan.taskSeed);
}

function selectFrozen(trainingAttempts, plan) {
  const frozen = {};
  const families = [...new Set(plan.training.taskIds.map((id) => `regime-${id.split('-')[1]}`))];
  for (const family of families) {
    const rows = trainingAttempts.filter((a) => a.family === family);
    const ranked = plan.training.candidateTopologies.map((topology) => {
      const subset = rows.filter((a) => a.topology === topology);
      const passed = subset.filter((a) => a.oraclePassed).length;
      const tokens = subset.reduce((s, a) => s + (a.tokenUsage?.total || 0), 0);
      return { topology, passed, total: subset.length, tokens };
    }).sort((a, b) => b.passed - a.passed || a.tokens - b.tokens || (a.topology < b.topology ? -1 : 1));
    frozen[family] = ranked[0].topology;
  }
  return frozen;
}

function confirmatoryJobs(plan, data, frozen) {
  const jobs = [];
  const tasks = data.tasks.filter((t) => t.split === 'holdout');
  for (const task of tasks) {
    const conditions = plan.conditions.map((c) => (c.id === 'genos-frozen'
      ? { ...c, topology: frozen[task.family] } : { ...c }));
    for (const condition of shuffle(conditions, plan.seeds[0] + jobs.length)) {
      jobs.push({ condition, task, seed: plan.seeds[0] });
    }
  }
  return jobs;
}

function evaluateCampaign(input) {
  const { attempts, plan } = input;
  const vsFrozen = compareAgainst(attempts, 'genos-frozen');
  const vsWrong = compareAgainst(attempts, 'genos-wrong');
  const adaptive = attempts.filter((a) => a.conditionId === 'genos-adaptive');
  const attested = adaptive.filter((a) => a.attestation?.transitionId).length;
  const overBudget = attempts.filter((a) => !a.budgetOk).length;
  const gainFrozen = vsFrozen.lo !== null && vsFrozen.lo > 0;
  const gainWrong = vsWrong.lo !== null && vsWrong.lo > 0;
  return { vsFrozen, vsWrong, adaptiveAttested: attested, adaptiveTotal: adaptive.length,
    overBudget, success: gainFrozen && gainWrong && overBudget === 0 && attested > 0,
    successNote: 'Une transition verifiee sans gain prouve le mecanisme, pas son utilite.' };
}

async function runCampaign(options) {
  const { plan, data } = loadInputs();
  verifyFrozen(plan, data);
  const qualification = qualifyRegimePlan(plan, data.tasks);
  if (options.claim === 'confirmatory') assertConfirmatory(plan, data.tasks);
  await checkModel(plan);
  const outputRoot = options.output || path.join(repo, 'artifacts', 'topology-morphogenesis', 'regime-change');
  const runDir = path.join(outputRoot, `regime-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(runDir, { recursive: true });
  const freeze = freezeRecord(runDir, plan);
  let frozen = plan.frozenTopology;
  if (options.stage !== 'confirmatory') {
    const trainingAttempts = await runJobs({ jobs: trainingJobs(plan, data), runDir, plan, model: plan.model });
    frozen = selectFrozen(trainingAttempts, plan);
    fs.writeFileSync(path.join(runDir, 'training.json'), JSON.stringify({ frozen, trainingAttempts }, null, 2));
  }
  if (!frozen) throw new Error('Confirmatory stage requires frozen topology: run the training stage first.');
  let attempts = [];
  if (options.stage !== 'training') {
    attempts = await runJobs({ jobs: confirmatoryJobs(plan, data, frozen), runDir, plan, model: plan.model });
  }
  const evaluation = { ...evaluateCampaign({ attempts, plan }), qualification };
  const report = { runDir, stage: options.stage, claim: options.claim || 'pilot', frozen, freeze, evaluation, attempts };
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(report, null, 2));
  return { runDir, frozen, evaluation };
}

async function main() {
  try {
    const summary = await runCampaign(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ runDir: summary.runDir, frozen: summary.frozen, evaluation: summary.evaluation })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { runCampaign, selectFrozen, evaluateCampaign };
