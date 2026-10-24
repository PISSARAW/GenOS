'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const metrics = ['integrity', 'branchIsolation', 'epistemicConflict', 'permissionSafety', 'replay'];

function loadPackage(name) {
  const root = process.env.GENOS_AGENTGIT_BENCH_DEPS;
  if (!root || !path.isAbsolute(root)) throw new Error('GENOS_AGENTGIT_BENCH_DEPS must be an absolute installation path.');
  return createRequire(path.join(root, 'package.json'))(name);
}

function evidence(system, task, observation) {
  const dir = path.join(process.cwd(), 'artifacts', system.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const relative = path.join('artifacts', system.toLowerCase(), `${task}.json`);
  const bytes = Buffer.from(`${JSON.stringify(observation, null, 2)}\n`);
  fs.writeFileSync(path.join(process.cwd(), relative), bytes);
  return { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function contexaIsolation() {
  const { GCCWorkspace } = loadPackage('contexa');
  const workspace = path.join(process.cwd(), 'artifacts', 'contexa', 'workspace');
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
  const ws = new GCCWorkspace(workspace);
  ws.init('Branch isolation benchmark');
  ws.commit('base-marker');
  ws.branch('candidate', 'Independent change');
  ws.commit('candidate-marker');
  const child = ws.context('candidate', 1);
  const mainBefore = ws.context('main', 1);
  ws.merge('candidate');
  const mainAfter = ws.context('main', 1);
  const observation = { child: child.commits.map((item) => item.thisCommitContribution),
    mainBefore: mainBefore.commits.map((item) => item.thisCommitContribution),
    mainAfter: mainAfter.commits.map((item) => item.thisCommitContribution),
    branches: ws.listBranches() };
  const pass = observation.child.includes('candidate-marker')
    && !observation.mainBefore.includes('candidate-marker')
    && observation.mainAfter.some((item) => item.includes('candidate'));
  return { pass, observation };
}

async function langGraphIsolation() {
  const { Annotation, StateGraph, START, END, MemorySaver } = loadPackage('@langchain/langgraph');
  const state = Annotation.Root({ value: Annotation() });
  const graph = new StateGraph(state).addNode('step', (input) => ({ value: `${input.value}!` }))
    .addEdge(START, 'step').addEdge('step', END).compile({ checkpointer: new MemorySaver() });
  const config = { configurable: { thread_id: 'agentgit-branch-isolation' } };
  await graph.invoke({ value: 'base' }, config);
  const history = [];
  for await (const snapshot of graph.getStateHistory(config)) history.push(snapshot);
  const origin = history.find((snapshot) => snapshot.values.value === 'base!');
  if (!origin) throw new Error('LangGraph did not expose the origin checkpoint.');
  const branch = await graph.updateState(origin.config, { value: 'candidate' });
  const original = await graph.getState(origin.config);
  const candidate = await graph.getState(branch);
  const observation = { original: original.values.value, candidate: candidate.values.value,
    originCheckpoint: origin.config.configurable.checkpoint_id,
    candidateCheckpoint: branch.configurable.checkpoint_id };
  return { pass: observation.original === 'base!' && observation.candidate === 'candidate'
    && observation.originCheckpoint !== observation.candidateCheckpoint, observation };
}

async function genosIsolation() {
  const repo = process.env.GENOS_AGENTGIT_BENCH_REPO;
  if (!repo || !path.isAbsolute(repo)) throw new Error('GENOS_AGENTGIT_BENCH_REPO must be absolute.');
  process.env.NODE_ENV = 'test';
  const file = path.join(process.cwd(), 'artifacts', 'genos', 'branch-isolation.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });
  process.env.GENOS_DB_PATH = file;
  const db = require(path.join(repo, 'backend', 'src', 'db'));
  const git = require(path.join(repo, 'backend', 'src', 'services', 'agentGitService'));
  const connection = await db.getDatabase(file);
  const workspace = await connection.get('SELECT id FROM workspaces LIMIT 1');
  await connection.run(`INSERT INTO agents (id, workspace_id, name, role, status, cognitive_budget)
    VALUES (?, ?, ?, ?, ?, ?)`, 'benchmark-agent', workspace?.id || null, 'Benchmark', 'worker', 'idle', 10);
  const req = { user: { username: 'benchmark' }, tenant: null, body: {} };
  const base = await git.createCommit(req, { agentId: 'benchmark-agent', refName: 'main' });
  await connection.run('UPDATE agents SET role = ? WHERE id = ?', 'candidate', 'benchmark-agent');
  const branch = await git.createCommit(req, { agentId: 'benchmark-agent', refName: 'candidate' });
  const main = await git.show({ ...req, body: { objectId: base.id } });
  const child = await git.show({ ...req, body: { objectId: branch.id } });
  const observation = { mainRole: main.object?.state?.agent?.role,
    candidateRole: child.object?.state?.agent?.role,
    mainObjectId: base.id, candidateObjectId: branch.id,
    signatureValid: main.object?.signatureValid && child.object?.signatureValid };
  return { pass: observation.mainRole === 'worker' && observation.candidateRole === 'candidate'
    && observation.signatureValid === true, observation };
}

async function execute(system, task) {
  if (task.id !== 'branch-isolation') return { status: 'not_run', reason: 'No common executable task adapter.' };
  if (system === 'Contexa') return contexaIsolation();
  if (system === 'LangGraph') return langGraphIsolation();
  if (system === 'GenOS') return genosIsolation();
  return { status: 'not_run', reason: 'Requires model, credentials, or isolated runtime.' };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.schema !== 'genos.agentgit-benchmark-task/v1') throw new Error('Invalid task input.');
  const system = process.argv[2];
  if (input.system !== system) throw new Error('Manifest system mismatch.');
  const result = await execute(system, input.task);
  const answers = Object.fromEntries(metrics.map((metric) => [metric, { result: 'not_run' }]));
  if (result.status === 'not_run') answers.branchIsolation.reason = result.reason;
  else answers.branchIsolation = { result: result.pass ? 'pass' : 'fail',
    evidence: evidence(system, input.task.id, result.observation) };
  process.stdout.write(JSON.stringify({ taskId: input.task.id, system,
    version: process.argv[3], metrics: answers }));
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
