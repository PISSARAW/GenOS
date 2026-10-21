'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { runProcedure } = require('../../backend/src/services/agents/deterministicWorkerProcedures');
const { runArithmetic } = require('../../backend/src/services/agents/workerArithmeticExecutor');
const { runScoped } = require('../../backend/src/services/agents/workerScopedProcedures');
const { runFormal } = require('../../backend/src/services/agents/deterministicWorkerFormal');
const { runVerification } = require('../../backend/src/services/agents/deterministicWorkerVerifier');
const { runRed } = require('../../backend/src/services/agents/deterministicWorkerRed');
const { runExperiment } = require('../../backend/src/services/agents/deterministicWorkerExperiment');
const { runSynthesis } = require('../../backend/src/services/agents/deterministicWorkerSynthesis');
const { runMonitor } = require('../../backend/src/services/agents/deterministicWorkerMonitor');
const { runForensic } = require('../../backend/src/services/agents/deterministicWorkerForensic');
const { runScout } = require('../../backend/src/services/agents/deterministicWorkerScout');
const { runTeaching } = require('../../backend/src/services/agents/deterministicWorkerTeaching');
const { runAdaptive, runNiche, runHost } = require('../../backend/src/services/agents/workerScopedProcedures');
const { runCandidates, runClinical } = require('../../backend/src/services/agents/workerCandidateExecutor');
const { runRecovery } = require('../../backend/src/services/agents/workerRecoveryExecutor');
const { runHandoff } = require('../../backend/src/services/agents/workerCoordinationExecutor');
const { runCode } = require('../../backend/src/services/agents/workerCodeVerification');
const { runMath } = require('../../backend/src/services/agents/deterministicWorkerMath');
const REPO_ROOT = path.resolve(__dirname, '../..');

const RUNNERS = Object.freeze({
  scout_cell: [runScout, 'scoutReceipt'],
  procedural_executor: [runProcedure, 'receipt'],
  verifier_worker: [runVerification, 'expectedReceipt'],
  red_worker: [runRed, 'expectedReceipt'],
  experimental_worker: [runExperiment, 'procedureReceipt'],
  synthesis_worker: [runSynthesis, 'synthesisReceipt'],
  resident_daemon: [runMonitor, 'monitorReceipt'],
  forensic_worker: [runForensic, 'forensicReceipt'],
  teaching_worker: [runTeaching, 'teachingReceipt'],
  math_worker: [runMath, 'receipt']
});

async function runCase(testCase) {
  if (testCase.id === 'bounded-code') return require('./bounded-code-adapter.cjs').runBoundedCode();
  if (testCase.workerKind === 'sub_orchestrator') return runSubgraphCase(testCase);
  if (testCase.workerKind === 'verifier_worker'
    && testCase.methodContract?.methodId === 'verify_code_postconditions') {
    return runCodeCase(testCase.methodContract);
  }
  const runner = RUNNERS[testCase.workerKind];
  if (runner) {
    const result = runner[0](testCase.methodContract);
    return { status: 'executed', result, receipt: result[runner[1]] };
  }
  if (testCase.workerKind === 'formal_worker' && testCase.methodContract?.methodId === 'check_arithmetic') {
    const result = runArithmetic(testCase.methodContract);
    return { status: 'executed', result, receipt: result.solverReceipt, methodContract: testCase.methodContract };
  }
  if (testCase.workerKind === 'formal_worker') {
    return runFormalCase(testCase.methodContract);
  }
  const structured = await runStructuredCase(testCase);
  if (structured) return structured;
  return { status: 'unavailable', reason: 'No real benchmark adapter is connected for this worker kind.' };
}

async function runFormalCase(methodContract) {
  const toolchainVersion = process.env.GENOS_BENCHMARK_LEAN_VERSION;
  if (!toolchainVersion) return { status: 'unavailable', reason: 'GENOS_BENCHMARK_LEAN_VERSION is required.' };
  const method = { ...methodContract, parameters: { ...methodContract.parameters, toolchainVersion } };
  const result = await runFormal(method, { timeoutMs: 120000 });
  return { status: 'executed', result, receipt: result.solverReceipt };
}

function runSubgraphCase(testCase) {
  const expected = require('../../backend/tests/workerComplianceSubOrchestrator.cjs').method();
  if (!isDeepStrictEqual(testCase.methodContract, expected)) {
    return { status: 'failed', reason: 'Subgraph benchmark contract differs from its qualification fixture.' };
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-benchmark-subgraph-'));
  const reportPath = path.join(root, 'qualification.json');
  const campaign = path.join(REPO_ROOT, 'backend/tests/run_worker_qualification_campaign.cjs');
  try {
    const command = spawnSync(process.execPath, [campaign, reportPath, 'sub_orchestrator'], {
      cwd: REPO_ROOT, env: process.env, encoding: 'utf8', timeout: 240000,
      maxBuffer: 16 * 1024 * 1024, windowsHide: true
    });
    if (command.error || !fs.existsSync(reportPath)) {
      return { status: 'failed', reason: command.error?.message || command.stderr || 'Qualification report missing.' };
    }
    return subgraphExecution(testCase, JSON.parse(fs.readFileSync(reportPath, 'utf8')));
  } finally { removeSubgraphRoot(root); }
}

function subgraphExecution(testCase, report) {
  const item = report.results?.find((entry) => entry.kind === 'sub_orchestrator');
  if (!item?.result) return { status: 'failed', reason: 'Subgraph mission result missing.' };
  const content = item.result.workerArtifactContent;
  return { status: 'executed', result: { mission: item.result, manifest: item.manifest,
    benchmarkDigest: report.benchmarkDigest, workerArtifactContent: content },
  receipt: content?.coordinationReceipt, methodContract: testCase.methodContract };
}

function removeSubgraphRoot(root) {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir())
    || !path.basename(root).startsWith('genos-worker-benchmark-subgraph-')) {
    throw new Error('Refusing to remove a path outside the dedicated subgraph fixture.');
  }
  fs.rmSync(root, { recursive: true, force: true });
}

async function runStructuredCase(testCase) {
  const { workerKind, methodContract } = testCase;
  if (!methodContract) return null;
  const runner = structuredRunner(workerKind, methodContract.methodId);
  return runner ? runner(methodContract) : null;
}

function structuredRunner(kind, methodId) {
  const scoped = { adaptive_worker: runAdaptive, bounded_worker: runScoped,
    specialist: runNiche, symbiotic_worker: runHost };
  const direct = { creative_worker: runCandidates, medical_worker: runClinical,
    liaison_worker: runHandoff };
  if (scoped[kind]) return (method) => runScopedCase(scoped[kind], method);
  if (direct[kind]) return (method) => reportResult(direct[kind](method), method);
  if (kind === 'recovery_worker') return runRecoveryCase;
  if (kind === 'verifier_worker' && methodId === 'verify_code_postconditions') return runCodeCase;
  return null;
}

function context(method) {
  const parameters = method.parameters;
  return { deadline: Date.now() + 30000, mission: { agentId: 'benchmark-worker',
    workerContract: { limits: { maxIterations: 20, maxStrategyChanges: 20 }, mission: {
      scope: 'benchmark://bounded-worker-scope', specialtyNiche: parameters.niche,
      hostContractId: 'benchmark-host-contract', hostCapabilities: [parameters.capability]
    } } } };
}

function runScopedCase(runner, method) {
  const executionContext = context(method);
  return reportResult(runner(method, executionContext), method, executionContext);
}

function reportResult(report, method, executionContext = {}) {
  return { status: 'executed', result: report.output, receipt: report.receipt,
    methodContract: report.evidenceReport.workerArtifact.methodContract?.methodContract || method,
    workerContract: executionContext.mission?.workerContract };
}

async function runRecoveryCase(method) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-benchmark-recovery-'));
  const statePath = path.join(root, method.parameters.path);
  try {
    fs.writeFileSync(statePath, 'damaged-state');
    const mission = { agentId: 'benchmark-recovery', workspaceRoot: root, workerContract: {
      authority: { execute: true }, mission: { scope: root,
        recoveryLease: { action: 'restore_checkpoint', path: method.parameters.path } }
    } };
    const report = await runRecovery(method, { mission, deadline: Date.now() + 30000 });
    return { status: 'executed', result: report.output, receipt: report.receipt,
      methodContract: method, observedRestoredContent: fs.readFileSync(statePath, 'utf8'),
      workerContract: mission.workerContract };
  } finally { removeRecoveryRoot(root); }
}

async function runCodeCase(method) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-benchmark-code-'));
  const source = require('./cases.cjs').CODE_EXPRESSION;
  const sourcePath = path.join(root, method.parameters.artifactPath);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  try {
    fs.writeFileSync(sourcePath, source, { flag: 'wx' });
    const context = { mission: { workspaceRoot: root } };
    return { ...reportResult(await runCode(method, context), method), observedSource: source };
  } finally { removeCodeRoot(root); }
}

function removeCodeRoot(root) {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir())
    || !path.basename(root).startsWith('genos-worker-benchmark-code-')) {
    throw new Error('Refusing to remove a path outside the dedicated code fixture.');
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function removeRecoveryRoot(root) {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir())
    || !path.basename(root).startsWith('genos-worker-benchmark-recovery-')) {
    throw new Error('Refusing to remove a path outside the dedicated recovery fixture.');
  }
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = { runCase };
