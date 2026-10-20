'use strict';

const path = require('node:path');
const processRunner = require('./helpers/suiteProcessRunner.cjs');

const backendRoot = path.resolve(__dirname, '..');
const DEFAULT_SUITE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_CHILD_TIMEOUT_MS = 35 * 60 * 1000;
const topologyChecks = Object.freeze([
  { id: 'trinity', label: 'Trinity', scripts: [
    ['tests/run_trinity_suite.js'], ['tests/test_gqwf_trinity_mission_qualification.js']] },
  { id: 'a_team', label: 'A-Team', scripts: [
    ['tests/test_ateam_execution_e2e.js'], ['tests/test_ateam_terminal_wait.js'],
    ['tests/test_ateam_multiteam_runtime.js'], ['tests/test_ateam_completion_adapter.js']] },
  { id: 'biome', label: 'Biome', scripts: [['tests/run_biome_suite.js']] },
  { id: 'biocenose', label: 'Biocenose', scripts: [['tests/run_biocenose_suite.js']] },
  { id: 'rhizome', label: 'Rhizome', scripts: [['tests/run_rhizome_suite.js']] },
  { id: 'syncytium', label: 'Syncytium', scripts: [['tests/run_syncytium_suite.js']] },
  { id: 'holobionte', label: 'Holobiont', scripts: [['tests/run_holobiont_suite.js']] },
  { id: 'metapopulation', label: 'Metapopulation', scripts: [
    ['tests/run_validation_suite.js', 'metapopulation']] }
]);

const boundaryChecks = Object.freeze([
  { id: 'worker_wait', label: 'Attached worker completion',
    scripts: [['tests/test_topology_worker_wait_contract.js'],
      ['tests/test_biological_mission_completion.js'], ['tests/test_worker_result_reader.js']] },
  { id: 'variant_fallback', label: 'Variant fallback traceability',
    scripts: [['tests/test_topology_variant_fallback_traceability.js']] },
  { id: 'biological_receipts', label: 'Biological receipts and restart',
    scripts: [['tests/run_biology_suite.cjs']] },
  { id: 'morphogenesis_commit', label: 'Governed morphogenesis commit',
    scripts: [['tests/test_morphogenesis_authenticated_commit.js']] },
  { id: 'llm_stdio', label: 'LLM runtime startup and stdio',
    scripts: [['tests/test_orchestrator_local_models.js']] }
]);

function createPolicy(env, now) {
  const suiteTimeoutMs = processRunner.positiveMilliseconds(
    env.GENOS_TOPOLOGY_SUITE_TIMEOUT_MS, DEFAULT_SUITE_TIMEOUT_MS,
    'GENOS_TOPOLOGY_SUITE_TIMEOUT_MS');
  const childTimeoutMs = processRunner.positiveMilliseconds(
    env.GENOS_TOPOLOGY_CHILD_TIMEOUT_MS, DEFAULT_CHILD_TIMEOUT_MS,
    'GENOS_TOPOLOGY_CHILD_TIMEOUT_MS');
  return { childTimeoutMs, deadlineMs: now + suiteTimeoutMs };
}

function runScript(command, context = {}) {
  context = createContext(context);
  const [script, ...args] = command;
  const deadlineMs = Math.min(context.policy.deadlineMs,
    context.now() + context.policy.childTimeoutMs);
  const env = {
    ...(context.env || process.env),
    GENOS_PARENT_DEADLINE_EPOCH_MS: String(deadlineMs)
  };
  return processRunner.runProcess({
    command: process.execPath, args: [script, ...args], cwd: backendRoot, env,
    timeoutMs: context.policy.childTimeoutMs, deadlineMs
  }, context.dependencies);
}

function failureReason(outcome) {
  return [outcome.status, `exit=${outcome.exitCode ?? '-'}`, `signal=${outcome.signal || '-'}`,
    `error=${outcome.errorCode || '-'}`].join(' ');
}

function execute(check, context = {}) {
  context = createContext(context);
  context.stdout.write(`\n=== ${check.label} ===\n`);
  for (const command of check.scripts) {
    const label = command.join(' ');
    context.stdout.write(`[START] ${label}\n`);
    const outcome = runScript(command, context);
    processRunner.writeCapturedOutput(outcome, context);
    context.stdout.write(`${processRunner.formatOutcome(label, outcome)}\n`);
    if (outcome.status !== 'PASS') {
      return { id: check.id, label: check.label, command: label,
        reason: failureReason(outcome) };
    }
  }
  return null;
}

function selectedTopologies(args) {
  const option = args.find((item) => item.startsWith('--topology='));
  if (!option) return topologyChecks;
  const requested = option.slice('--topology='.length).trim().toLowerCase();
  const selected = topologyChecks.filter((item) => item.id === requested);
  if (!selected.length) throw new Error(`Unknown topology '${requested}'.`);
  return selected;
}

function printCatalog(stdout = process.stdout) {
  stdout.write(`${topologyChecks.map((item) => `${item.id}: ${item.label}`).join('\n')}\n`);
  stdout.write('\nBoundary checks:\n');
  stdout.write(`${boundaryChecks.map((item) => `${item.id}: ${item.label}`).join('\n')}\n`);
}

function runChecks(checks, context) {
  return checks.map((check) => execute(check, context)).filter(Boolean);
}

function createContext(options = {}, startedAt) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const now = options.now || Date.now;
  const policyStart = startedAt === undefined ? now() : startedAt;
  return { env, stdout, stderr, now, dependencies: options.dependencies || {},
    policy: options.policy || createPolicy(env, policyStart) };
}

function reportRun(result, context) {
  const passed = result.topologies.length - result.topologyFailures.length;
  context.stdout.write(`\nTopology contract checks: ${passed}/${result.topologies.length} passed.\n`);
  if (result.includeBoundaries) {
    const boundaryPassed = boundaryChecks.length - result.boundaryFailures.length;
    context.stdout.write(`Boundary checks: ${boundaryPassed}/${boundaryChecks.length} passed.\n`);
  }
  context.stdout.write(`Topology runner summary: failures=${result.failures.length} ` +
    `durationMs=${Math.max(0, context.now() - result.startedAt)}\n`);
  context.stdout.write('Controlled contracts do not certify a live provider or production deployment.\n');
  if (result.failures.length) {
    context.stderr.write(`${JSON.stringify(result.failures, null, 2)}\n`);
    process.exitCode = 1;
  }
}

function executeRun(args, context, startedAt) {
  const topologies = selectedTopologies(args);
  const includeBoundaries = !args.some((item) => item.startsWith('--topology='));
  const topologyFailures = runChecks(topologies, context);
  const boundaryFailures = includeBoundaries ? runChecks(boundaryChecks, context) : [];
  const failures = [...topologyFailures, ...boundaryFailures];
  const result = { failures, topologyFailures, boundaryFailures,
    topologies, includeBoundaries, startedAt };
  reportRun(result, context);
  return result;
}

function main(args = process.argv.slice(2), options = {}) {
  if (args.includes('--list')) { printCatalog(options.stdout); return; }
  const now = options.now || Date.now;
  const startedAt = now();
  try {
    return executeRun(args, createContext(options, startedAt), startedAt);
  } catch (error) {
    const stderr = options.stderr || process.stderr;
    stderr.write(`[FAIL] Topology runner error=${error.message}\n`);
    stderr.write('Topology runner summary: failures=1 durationMs=0\n');
    process.exitCode = 1;
    return { failures: [{ reason: error.message }], topologyFailures: [], boundaryFailures: [] };
  }
}

if (require.main === module) main();

module.exports = {
  topologyChecks, boundaryChecks, createPolicy, selectedTopologies, runScript, execute, main
};
