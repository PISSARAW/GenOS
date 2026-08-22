#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchmarkDir, '../..');
const fixtureSource = path.join(repoRoot, 'examples/unknown-cause-bug/buggy-service');
const schema = path.join(benchmarkDir, 'response.schema.json');
const resultsRoot = path.join(benchmarkDir, 'results');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(resultsRoot, 'runs', runId);
const mcpBinary = path.join(repoRoot, 'target/debug/genos-mcp');
const rescoreOnly = process.argv.includes('--rescore-latest');
const selectedModels = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));

const prompt = `Diagnose le défaut du petit service Rust présent dans le répertoire courant.
Tu peux lire les sources et exécuter les tests, mais ne modifie aucun fichier.
Établis la cause racine avec des preuves, propose le patch minimal, rejette au moins
trois hypothèses alternatives plausibles, puis donne les trois commandes de vérification
les plus ciblées. Utilise les outils disponibles uniquement s'ils renforcent les preuves.
Retourne exclusivement l'objet JSON demandé.`;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function catalog() {
  const result = run('codex', ['debug', 'models']);
  if (result.status !== 0) throw new Error(result.stderr || 'codex model catalog failed');
  const parsed = JSON.parse(result.stdout);
  return (parsed.models ?? parsed)
    .filter((model) => model.visibility === 'list')
    .map((model) => model.slug);
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function parseEvents(stdout) {
  return stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function completedToolItems(events) {
  return events
    .filter((event) => event.type === 'item.completed' && /tool|command/.test(event.item?.type ?? ''))
    .map((event) => event.item);
}

function toolSummary(item) {
  return { type: item.type, name: item.name ?? item.command ?? null };
}

function isGenosMcpTool(item) {
  const identity = `${item.server ?? ''} ${item.name ?? ''} ${item.tool ?? ''}`.toLowerCase();
  return (item.type ?? '').includes('mcp') && identity.includes('genos');
}

function includesAll(text, terms) {
  const normalized = text.toLowerCase();
  return terms.every((term) => normalized.includes(term));
}

function scoreResponse(raw) {
  let answer;
  try { answer = JSON.parse(raw); } catch {
    return { score: 0, max_score: 10, checks: { valid_json: false } };
  }
  const combinedEvidence = (answer.evidence ?? []).join(' ');
  const faultEvidence = `${answer.diagnosis} ${answer.minimal_patch} ${combinedEvidence}`;
  const verification = (answer.verification_commands ?? []).join(' ').toLowerCase();
  const checks = {
    valid_json: true,
    exact_fault: includesAll(faultEvidence, ['cached_rate', 'update_configuration']),
    correct_patch: includesAll(answer.minimal_patch ?? '', ['cached_rate', 'rate']),
    quote_evidence: includesAll(`${answer.diagnosis} ${combinedEvidence}`, ['quote', 'cached_rate']),
    freshness_evidence: includesAll(combinedEvidence, ['source_rate', 'cached_rate']),
    targeted_tests: verification.includes('test_18')
      && verification.includes('trace_212')
      && (verification.includes('reproduction') || verification.includes('production_sequence')),
    alternatives_rejected: Array.isArray(answer.rejected_hypotheses) && answer.rejected_hypotheses.length >= 3,
    correct_file: (answer.root_cause_file ?? '').endsWith('src/lib.rs'),
  };
  const weights = {
    valid_json: 1,
    exact_fault: 2,
    correct_patch: 2,
    quote_evidence: 1.5,
    freshness_evidence: 1.5,
    targeted_tests: 1,
    alternatives_rejected: 0.5,
    correct_file: 0.5,
  };
  const score = Object.entries(weights)
    .reduce((total, [name, weight]) => total + (checks[name] ? weight : 0), 0);
  return { score, max_score: 10, checks };
}

function execute(model, condition) {
  const caseDir = path.join(runDir, `${safeName(model)}-${condition}`);
  const fixtureDir = path.join(caseDir, 'fixture');
  mkdirSync(caseDir, { recursive: true });
  cpSync(fixtureSource, fixtureDir, { recursive: true });
  const responseFile = path.join(caseDir, 'response.json');
  const args = [
    'exec', '--ignore-user-config', '--ephemeral', '--json', '--color', 'never',
    '--skip-git-repo-check', '--sandbox', 'workspace-write', '--model', model,
    '-c', 'model_reasoning_effort="medium"', '--cd', fixtureDir,
    '--output-schema', schema, '--output-last-message', responseFile,
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
  const result = run('codex', args);
  const durationMs = Math.round(performance.now() - started);
  writeFileSync(path.join(caseDir, 'events.jsonl'), result.stdout);
  writeFileSync(path.join(caseDir, 'stderr.log'), result.stderr);
  const events = parseEvents(result.stdout);
  const completion = events.findLast((event) => event.type === 'turn.completed');
  const toolItems = completedToolItems(events);
  const rawResponse = result.status === 0 && readFileSync(responseFile, 'utf8');
  rmSync(path.join(fixtureDir, 'target'), { recursive: true, force: true });
  return {
    model,
    condition,
    exit_code: result.status,
    duration_ms: durationMs,
    usage: completion?.usage ?? null,
    tool_calls: toolItems.map(toolSummary),
    genos_mcp_tool_calls: toolItems.filter(isGenosMcpTool).length,
    ...scoreResponse(rawResponse || ''),
    artifacts: path.relative(repoRoot, caseDir),
  };
}

function aggregateSamples(rows, condition) {
  const selected = rows.filter((sample) => sample.condition === condition);
  const succeeded = selected.filter((sample) => sample.exit_code === 0);
  return {
    runs: selected.length,
    successful_runs: succeeded.length,
    mean_score: selected.reduce((sum, row) => sum + row.score, 0) / selected.length,
    mean_duration_ms: selected.reduce((sum, row) => sum + row.duration_ms, 0) / selected.length,
    total_input_tokens: selected.reduce((sum, row) => sum + (row.usage?.input_tokens ?? 0), 0),
    total_output_tokens: selected.reduce((sum, row) => sum + (row.usage?.output_tokens ?? 0), 0),
    tool_calls: selected.reduce((sum, row) => sum + row.tool_calls.length, 0),
    genos_mcp_tool_calls: selected.reduce((sum, row) => sum + (row.genos_mcp_tool_calls ?? 0), 0),
  };
}

if (rescoreOnly) {
  const latestFile = path.join(resultsRoot, 'latest.json');
  const report = JSON.parse(readFileSync(latestFile, 'utf8'));
  report.samples = report.samples.map((sample) => {
    const response = readFileSync(path.join(repoRoot, sample.artifacts, 'response.json'), 'utf8');
    const events = parseEvents(readFileSync(path.join(repoRoot, sample.artifacts, 'events.jsonl'), 'utf8'));
    const toolItems = completedToolItems(events);
    return {
      ...sample,
      tool_calls: toolItems.map(toolSummary),
      genos_mcp_tool_calls: toolItems.filter(isGenosMcpTool).length,
      ...scoreResponse(response),
    };
  });
  report.aggregate = {
    standard: aggregateSamples(report.samples, 'standard'),
    genos: aggregateSamples(report.samples, 'genos'),
  };
  report.rescored_at = new Date().toISOString();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(latestFile, serialized);
  const firstArtifact = report.samples[0]?.artifacts;
  if (firstArtifact) {
    const timestampedReport = path.join(repoRoot, path.dirname(firstArtifact), 'report.json');
    writeFileSync(timestampedReport, serialized);
  }
  console.log(`rescored: ${path.relative(repoRoot, latestFile)}`);
  process.exit(0);
}

mkdirSync(runDir, { recursive: true });
const build = run('cargo', ['build', '--quiet', '-p', 'genos-mcp']);
if (build.status !== 0) throw new Error(build.stderr || 'genos-mcp build failed');
const availableModels = catalog();
const models = selectedModels.length > 0 ? selectedModels : availableModels;
for (const model of models) {
  if (!availableModels.includes(model)) throw new Error(`Codex model is not visible: ${model}`);
}

const samples = [];
for (const model of models) {
  for (const condition of ['standard', 'genos']) {
    const sample = execute(model, condition);
    samples.push(sample);
    console.log(`${model.padEnd(24)} ${condition.padEnd(8)} score=${sample.score}/10 duration=${sample.duration_ms}ms exit=${sample.exit_code}`);
  }
}

const report = {
  schema_version: 1,
  benchmark: 'codex-genos-vs-standard-smoke',
  generated_at: new Date().toISOString(),
  source_revision: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
  codex_version: run('codex', ['--version']).stdout.trim(),
  models,
  reasoning_effort: 'medium',
  controls: {
    identical_prompt: true,
    fresh_fixture_copy_per_run: true,
    standard: 'Codex with user configuration ignored and no MCP server',
    genos: 'Same Codex invocation with only the local GenOS MCP server added',
  },
  environment: { platform: os.platform(), release: os.release(), arch: os.arch() },
  aggregate: {
    standard: aggregateSamples(samples, 'standard'),
    genos: aggregateSamples(samples, 'genos'),
  },
  samples,
  limitations: [
    'One deterministic debugging task is a smoke benchmark, not evidence of general superiority.',
    'Each model-condition pair is executed once; stochastic variance is not estimated.',
    'The rubric measures correctness and evidence coverage, not prose style or user preference.',
    'MCP availability changes the model-visible tool catalog and server instructions, which is the treatment being measured.',
  ],
};
writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(resultsRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${path.relative(repoRoot, path.join(resultsRoot, 'latest.json'))}`);
