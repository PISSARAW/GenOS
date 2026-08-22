#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const missionOrder = ['B01', 'B02', 'B03', 'B04', 'B05', 'B09', 'B06', 'B07', 'B10', 'B08'];
const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(benchmarkRoot);

export function parseArguments(argv) {
  const options = { execute: false, dryRun: false, outputDir: 'benchmarks/results', tasks: missionOrder };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') options.execute = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--output-dir') options.outputDir = requiredValue(argv, ++index, argument);
    else if (argument === '--tasks') options.tasks = requiredValue(argv, ++index, argument).split(',').filter(Boolean);
    else throw new Error(`unknown argument: ${argument}`);
  }
  const unknown = options.tasks.filter((task) => !missionOrder.includes(task));
  if (unknown.length || options.tasks.length === 0) throw new Error(`unsupported task(s): ${unknown.join(', ')}`);
  return options;
}

export function taskCommand(taskId, outputDir) {
  const output = path.resolve(repositoryRoot, outputDir);
  const common = ['--output-dir', output];
  const commands = {
    B01: ['cargo', ['run', '--release', '-q', '-p', 'genos-store', '--bin', 'replay_benchmark', '--', '--iterations', '500', '--events', '100', '--warmups', '20', '--output', path.join(output, 'replay-fidelity-report.json')]],
    B02: ['node', ['benchmarks/run-safety-benchmarks.mjs', '--task', 'B02', ...common]],
    B03: ['node', ['benchmarks/run-runtime-benchmark.mjs', '--iterations', '500', ...common]],
    B04: ['node', ['benchmarks/run-specialist.mjs', '--tasks', 'B04', '--iterations', '500', '--events', '100', '--warmups', '20', ...common]],
    B05: ['node', ['benchmarks/run-safety-benchmarks.mjs', '--task', 'B05', ...common]],
    B09: ['node', ['benchmarks/run-safety-benchmarks.mjs', '--task', 'B09', ...common]],
    B06: ['node', ['benchmarks/public-runner.mjs', '--tasks', 'B06', ...common]],
    B07: ['node', ['benchmarks/public-runner.mjs', '--tasks', 'B07', ...common]],
    B10: ['node', ['benchmarks/run-specialist.mjs', '--tasks', 'B10', ...common]],
    B08: ['node', ['benchmarks/public-runner.mjs', '--tasks', 'B08', ...common]],
  };
  return commands[taskId];
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const plan = options.tasks.map((taskId) => ({ task_id: taskId, command: taskCommand(taskId, options.outputDir) }));
  if (options.dryRun || !options.execute) {
    process.stdout.write(`${JSON.stringify({ mode: 'plan', ordered_tasks: plan }, null, 2)}\n`);
    return { failed: false, plan };
  }
  const outputDir = path.resolve(repositoryRoot, options.outputDir);
  const evidenceDir = path.join(outputDir, 'coordination-evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tasks = [];
  for (const item of plan) {
    const result = executeTask(item, evidenceDir);
    tasks.push(result);
    if (!result.passed) break;
  }
  const completedIds = tasks.filter((task) => task.passed).map((task) => task.task_id);
  const audit = tasks.every((task) => task.passed) ? executeAudit(completedIds, outputDir) : null;
  const report = {
    schema_version: 'genos-benchmark-mission-v1',
    generated_at: new Date().toISOString(),
    requested_order: options.tasks,
    completed_order: completedIds,
    tasks,
    audit,
    failed: tasks.some((task) => !task.passed) || audit?.passed === false,
  };
  fs.writeFileSync(path.join(outputDir, 'mission-run.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: path.join(options.outputDir, 'mission-run.json'), failed: report.failed, completed_order: completedIds }, null, 2)}\n`);
  if (report.failed) process.exitCode = 1;
  return report;
}

function executeTask(item, evidenceDir) {
  const [command, args] = item.command;
  const started = process.hrtime.bigint();
  process.stderr.write(`[orchestrator] ${item.task_id}: ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const evidenceFile = path.join(evidenceDir, `${item.task_id}.log`);
  fs.writeFileSync(evidenceFile, output);
  return {
    task_id: item.task_id,
    passed: result.status === 0,
    exit_code: result.status,
    duration_ms: Number(process.hrtime.bigint() - started) / 1_000_000,
    output_sha256: crypto.createHash('sha256').update(output).digest('hex'),
    evidence_file: path.relative(repositoryRoot, evidenceFile),
  };
}

function executeAudit(taskIds, outputDir) {
  const args = ['benchmarks/audit-results.mjs', '--tasks', taskIds.join(','), '--results-dir', outputDir];
  const result = spawnSync('node', args, { cwd: repositoryRoot, encoding: 'utf8' });
  return { passed: result.status === 0, exit_code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}
