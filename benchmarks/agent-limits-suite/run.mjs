#!/usr/bin/env node
/*
 * Agent limits suite runner. Client-agnostic:
 *   --agent-cmd "<template>"   template may use {task_dir}, {answers_dir}, {prompt_file}
 *   --arms plain,genos         experimental arms (genos adds MCP config when the client supports it)
 *   --repetitions N            default 1; publication requires >=3
 *   --tasks id1,id2            subset, default all from suite.json
 *   --self-check               grade shipped golden answers (positive control)
 *                              and empty answers (negative control)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const suiteDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(suiteDir, '../..');
const suite = JSON.parse(readFileSync(path.join(suiteDir, 'suite.json'), 'utf8'));

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
const hasFlag = (name) => argv.includes(`--${name}`);
const tasks = (arg('tasks') ? arg('tasks').split(',') : suite.tasks.map((t) => t.id));
const arms = (arg('arms', 'plain')).split(',');
const reps = Number(arg('repetitions', '1'));
const agentCmd = arg('agent-cmd');

export function gradeTask(taskId, taskDir) {
  const entry = suite.tasks.find((t) => t.id === taskId);
  const graderPath = path.join(suiteDir, entry.grader);
  const r = spawnSync(process.execPath, [graderPath, taskDir], { encoding: 'utf8', timeout: 60_000 });
  try {
    const parsed = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
    return { ...parsed, grader_exit_code: r.status };
  } catch {
    return { passed: 0, failed: 1, total: 1, score: 0, error: `${r.stderr}`.slice(0, 400), grader_exit_code: r.status };
  }
}

function freshWorkspace(taskId, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(path.join(suiteDir, 'tasks', taskId), dest, { recursive: true });
}

function selfCheck() {
  const rows = [];
  for (const t of suite.tasks.filter((x) => tasks.includes(x.id))) {
    const tmp = path.join(os.tmpdir(), `limits-selfcheck-${t.id}-${Date.now()}`);
    // positive control: golden answers must pass
    freshWorkspace(t.id, tmp);
    const golden = path.join(suiteDir, 'graders', 'golden', t.id, 'answers');
    if (!existsSync(golden)) { rows.push({ task: t.id, positive: 'NO_GOLDEN', negative: '-' }); continue; }
    cpSync(golden, path.join(tmp, 'answers'), { recursive: true });
    const pos = gradeTask(t.id, tmp);
    // negative control: empty answers must fail
    rmSync(path.join(tmp, 'answers'), { recursive: true, force: true });
    const neg = gradeTask(t.id, tmp);
    rows.push({ task: t.id, positive: pos.total ? `${pos.passed}/${pos.total}` : 'ERR', negative: neg.score === 0 || neg.failed > 0 ? 'ok' : `LEAK(${neg.passed}/${neg.total})` });
    rmSync(tmp, { recursive: true, force: true });
  }
  console.table(rows);
  const leak = rows.find((r) => String(r.negative).startsWith('LEAK') || r.positive === 'ERR' || r.positive === 'NO_GOLDEN');
  process.exitCode = leak ? 1 : 0;
}

async function main() {
  if (hasFlag('self-check')) return selfCheck();
  if (!agentCmd) {
    console.error('Provide --agent-cmd "<template>" or --self-check.');
    process.exit(2);
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(suiteDir, 'results', 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  const samples = [];
  for (const arm of arms) {
    for (const taskId of tasks) {
      for (let rep = 1; rep <= reps; rep += 1) {
        const caseDir = path.join(runDir, `${arm}__${taskId}__r${rep}`);
        freshWorkspace(taskId, caseDir);
        const answersDir = path.join(caseDir, 'answers');
        mkdirSync(answersDir, { recursive: true });
        const cmd = agentCmd
          .replaceAll('{task_dir}', caseDir)
          .replaceAll('{answers_dir}', answersDir)
          .replaceAll('{prompt_file}', path.join(caseDir, 'task.md'))
          .replaceAll('{arm}', arm);
        const started = performance.now();
        const agent = spawnSync(cmd, { shell: true, cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
        const durationMs = Math.round(performance.now() - started);
        writeFileSync(path.join(caseDir, 'agent-stdout.log'), agent.stdout ?? '');
        writeFileSync(path.join(caseDir, 'agent-stderr.log'), agent.stderr ?? '');
        const g = gradeTask(taskId, caseDir);
        let tokens = null;
        try { tokens = JSON.parse((agent.stdout ?? '').trim().split(/\r?\n/).pop()).usage ?? null; } catch { /* optional */ }
        samples.push({ arm, task_id: taskId, repetition: rep, agent_exit_code: agent.status, duration_ms: durationMs, quality: g, token_usage: tokens });
        rmSync(path.join(caseDir, 'target'), { recursive: true, force: true });
        console.error(`${arm} ${taskId} r${rep}: ${g.passed}/${g.total} (${durationMs}ms)`);
      }
    }
  }
  const report = {
    schema_version: 1,
    benchmark: 'agent-limits-v1',
    generated_at: new Date().toISOString(),
    source_revision: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    source_tree_dirty: (spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim().length > 0),
    controls: { same_agent_cmd: true, fresh_workspace_per_run: true, hidden_graders: true, scope: suite.scope_note },
    aggregate: aggregateByArm(samples),
    publication_gate: {
      publishable: reps >= 3 && arms.length >= 2,
      requirements: ['at least 3 repetitions', 'at least two arms', 'clean source tree at analysis time'],
      failed: [...(reps >= 3 ? [] : ['fewer than 3 repetitions']), ...(arms.length >= 2 ? [] : ['single arm'])],
    },
    samples,
  };
  writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.aggregate, null, 2));
}

function aggregateByArm(samples) {
  const out = {};
  for (const s of samples) {
    out[s.arm] ??= { runs: 0, mean_score: 0, perfect_rate: 0 };
    const a = out[s.arm];
    a.runs += 1;
    a.mean_score = Math.round(((a.mean_score * (a.runs - 1) + (s.quality.score ?? 0)) / a.runs) * 10000) / 10000;
    a.perfect_rate = Math.round(((a.perfect_rate * (a.runs - 1) + (s.quality.passed === s.quality.total ? 1 : 0)) / a.runs) * 10000) / 10000;
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
