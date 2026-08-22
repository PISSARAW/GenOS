#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchmarkDir, '../..');
const fixtureSource = path.join(benchmarkDir, 'fixture');
const resultsRoot = path.join(benchmarkDir, 'results');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(resultsRoot, 'runs', runId);
const mcpBinary = path.join(repoRoot, 'target/debug/genos-mcp');
const model = process.argv[2] ?? 'gpt-5.6-sol';
const includeOrchestrator = process.argv.includes('--orchestrator');

const prompt = `Résous la tâche dans TASK.md. Tu peux modifier uniquement src/lib.rs et exécuter les tests.
Si l'outil MCP \`genos_orchestrate\` est disponible, tu dois l'appeler avant toute lecture ou modification, avec \`task\` décrivant brièvement cette mission de DP. Utilise ensuite sa réponse pour guider ton travail.
Implémente une solution complète, robuste aux zéros et aux très grands intermédiaires, et respecte la contrainte asymptotique.
N'édite ni les tests ni Cargo.toml. Quand tout est terminé, réponds très brièvement avec l'algorithme et les commandes de test exécutées.`;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function events(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function mcpCalls(items) {
  return items.filter((event) => event.type === 'item.completed' &&
    (event.item?.type ?? '').includes('mcp') &&
    `${event.item?.server ?? ''} ${event.item?.name ?? ''} ${event.item?.tool ?? ''}`.toLowerCase().includes('genos')).length;
}

function quality(grade) {
  const output = `${grade.stdout ?? ''}${grade.stderr ?? ''}`;
  const results = [...output.matchAll(/test result: (ok|FAILED)\. (\d+) passed; (\d+) failed;/g)].map((match) => ({ passed: Number(match[2]), failed: Number(match[3]) }));
  const passed = results.reduce((sum, result) => sum + result.passed, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  const total = passed + failed;
  return { passed, failed, total, score: total ? Number((passed / total).toFixed(4)) : null, all_passed: grade.status === 0 && failed === 0 };
}

function usageSummary(usage = null) {
  if (!usage) return null;
  const input = Number(usage.input_tokens || 0); const output = Number(usage.output_tokens || 0);
  return { input_tokens: input, output_tokens: output, cached_input_tokens: Number(usage.cached_input_tokens || 0), total_tokens: input + output };
}

function orchestratorEvidence(items) {
  const call = items.findLast((event) => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call' && event.item?.server === 'genos' && event.item?.tool === 'genos_orchestrate');
  const output = call?.item?.result?.structured_content?.output;
  const usage = output?.token_usage;
  return { called: Boolean(call), bridge_exit_code: call?.item?.result?.structured_content?.exit_code ?? null, agents: output?.agents ?? [], completed: Boolean(usage?.allRunsCompleted) && (output?.agents ?? []).every((agent) => agent.status === 'idle'), internal_tokens: Number(usage?.totalTokens || 0) };
}

function execute(condition) {
  const caseDir = path.join(runDir, `${model}-${condition}`);
  const fixtureDir = path.join(caseDir, 'fixture');
  mkdirSync(caseDir, { recursive: true });
  cpSync(fixtureSource, fixtureDir, { recursive: true });
  const responseFile = path.join(caseDir, 'response.md');
  if (condition === 'orchestrator') {
    const started = performance.now();
    const orchestrator = run('node', [path.join(benchmarkDir, 'run-orchestrator.cjs'), fixtureDir, path.join(caseDir, 'orchestrator.json')], { timeout: 15 * 60 * 1000 });
    const durationMs = Math.round(performance.now() - started);
    const grade = spawnSync('cargo', ['test', '--quiet'], { cwd: fixtureDir, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
    writeFileSync(path.join(caseDir, 'stderr.log'), orchestrator.stderr ?? '');
    writeFileSync(path.join(caseDir, 'grader.log'), `${grade.stdout ?? ''}${grade.stderr ?? ''}`);
    const orchestration = JSON.parse(readFileSync(path.join(caseDir, 'orchestrator.json'), 'utf8'));
    const internalTokens = Number(orchestration.token_usage?.totalTokens || 0);
    return { condition: 'genos_orchestrator', agent_exit_code: orchestrator.status, duration_ms: durationMs, quality: quality(grade), grader_exit_code: grade.status, token_usage: { caller: null, genos_internal: internalTokens, total: internalTokens }, orchestration: { completed: Boolean(orchestration.token_usage?.allRunsCompleted) && orchestration.agents.every((agent) => agent.status === 'idle'), agents: orchestration.agents }, artifacts: path.relative(repoRoot, caseDir) };
  }
  const args = [
    'exec', '--ignore-user-config', '--ephemeral', '--json', '--color', 'never',
    '--skip-git-repo-check', '--sandbox', 'workspace-write', '--model', model,
    '-c', 'model_reasoning_effort="high"', '--cd', fixtureDir,
    '--output-last-message', responseFile,
  ];
  if (condition === 'genos') {
    args.push(
      '-c', `mcp_servers.genos.command=${JSON.stringify(mcpBinary)}`,
      '-c', 'mcp_servers.genos.args=["stdio"]',
      '-c', `mcp_servers.genos.cwd=${JSON.stringify(repoRoot)}`,
      '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(fixtureDir)},GENOS_BIN=${JSON.stringify(path.join(repoRoot, 'target/debug/genos'))},GENOS_ORCHESTRATOR_BRIDGE=${JSON.stringify(path.join(repoRoot, 'backend/bin/genos-orchestrate.cjs'))}}`,
      '-c', 'mcp_servers.genos.startup_timeout_sec=120',
      '-c', 'mcp_servers.genos.tool_timeout_sec=300',
    );
  }
  args.push(prompt);
  const started = performance.now();
  const agent = run('codex', args, { timeout: 15 * 60 * 1000 });
  const durationMs = Math.round(performance.now() - started);
  writeFileSync(path.join(caseDir, 'events.jsonl'), agent.stdout ?? '');
  writeFileSync(path.join(caseDir, 'stderr.log'), agent.stderr ?? '');
  const grade = spawnSync('cargo', ['test', '--quiet'], {
    cwd: fixtureDir, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024,
  });
  writeFileSync(path.join(caseDir, 'grader.log'), `${grade.stdout ?? ''}${grade.stderr ?? ''}`);
  const history = events(agent.stdout ?? '');
  const completion = history.findLast((event) => event.type === 'turn.completed');
  const callerUsage = usageSummary(completion?.usage);
  const orchestration = condition === 'genos' ? orchestratorEvidence(history) : null;
  rmSync(path.join(fixtureDir, 'target'), { recursive: true, force: true });
  return {
    condition,
    agent_exit_code: agent.status,
    duration_ms: durationMs,
    quality: quality(grade),
    grader_exit_code: grade.status,
    token_usage: { caller: callerUsage, genos_internal: orchestration?.internal_tokens ?? 0, total: Number(callerUsage?.total_tokens || 0) + Number(orchestration?.internal_tokens || 0) },
    genos_mcp_tool_calls: mcpCalls(history),
    orchestration,
    artifacts: path.relative(repoRoot, caseDir),
  };
}

mkdirSync(runDir, { recursive: true });
const build = run('cargo', ['build', '--quiet', '-p', 'genos-mcp']);
if (build.status !== 0) throw new Error(build.stderr || 'unable to build GenOS MCP server');
const samples = ['standard', 'genos', ...(includeOrchestrator ? ['orchestrator'] : [])].map(execute);
const report = {
  schema_version: 2,
  benchmark: 'expert-dp-partition-cht',
  generated_at: new Date().toISOString(),
  model,
  reasoning_effort: 'high',
  task: 'Partition DP with squared segment sums; optimized affine-minimum queries required.',
  controls: {
    same_model: true,
    same_prompt: true,
    fresh_fixture_per_condition: true,
    standard: 'No MCP server',
    genos: 'Same Codex invocation with local GenOS MCP server',
    genos_orchestrator: includeOrchestrator ? 'Backend GenOS orchestrator runtime with bounded workers' : 'Not run; pass --orchestrator to spend an additional orchestrated sample.',
  },
  environment: { platform: os.platform(), release: os.release(), arch: os.arch() },
  samples,
  limitations: [
    'One expert DP task and one sample per condition do not establish general superiority.',
    'A GenOS tool call is evidence of workflow use, not independent proof that it caused the outcome.',
    'Wall time includes model, tool, and local test execution time.',
    'Quality is deterministic test pass rate; it does not measure readability, security, or generalization beyond this fixture.',
    'Total GenOS tokens are caller tokens plus internal orchestrator/worker tokens; cache tokens are reported separately and not added twice.',
  ],
};
writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(resultsRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
