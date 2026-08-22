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
    return { condition: 'genos_orchestrator', agent_exit_code: orchestrator.status, duration_ms: durationMs, tests_passed: grade.status === 0, grader_exit_code: grade.status, artifacts: path.relative(repoRoot, caseDir) };
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
  rmSync(path.join(fixtureDir, 'target'), { recursive: true, force: true });
  return {
    condition,
    agent_exit_code: agent.status,
    duration_ms: durationMs,
    tests_passed: grade.status === 0,
    grader_exit_code: grade.status,
    usage: completion?.usage ?? null,
    genos_mcp_tool_calls: mcpCalls(history),
    artifacts: path.relative(repoRoot, caseDir),
  };
}

mkdirSync(runDir, { recursive: true });
const build = run('cargo', ['build', '--quiet', '-p', 'genos-mcp']);
if (build.status !== 0) throw new Error(build.stderr || 'unable to build GenOS MCP server');
const samples = ['standard', 'genos', ...(includeOrchestrator ? ['orchestrator'] : [])].map(execute);
const report = {
  schema_version: 1,
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
  ],
};
writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(resultsRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
