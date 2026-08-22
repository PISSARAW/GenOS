#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const workspace = path.join(root, 'workspace');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(workspace, 'runs', runId);
const bootstrap = process.argv.includes('--bootstrap');
const syncStudio = process.argv.includes('--studio') || process.env.GENOS_STUDIO_SYNC === '1';
const studioUrl = process.env.GENOS_STUDIO_URL || 'http://localhost:4000';
const studioToken = process.env.GENOS_STUDIO_TOKEN || 'MILITARY-OVERRIDE-GENOS-2026';

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const portfolio = readJson('portfolio.json');
const backlog = readJson('backlog.json');
const fleet = readJson('fleet.json');
const policy = readJson('orchestrator.json');
const benchmarkById = new Map(portfolio.benchmarks.map((benchmark) => [benchmark.id, benchmark]));

fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(path.join(workspace, '.genos', 'agents'), { recursive: true });

function runGenos(args) {
  const result = spawnSync('cargo', ['run', '-q', '-p', 'genos-cli', '--', ...args], {
    cwd: workspace,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('GenOS command failed: cargo run -p genos-cli -- ' + args.join(' '));
  }
}

function calibrateAgents() {
  runGenos(['init']);
  const records = [];
  for (const agent of fleet.agents) {
    const base = path.join('.genos', 'agents', agent.id + '.yaml');
    const calibrated = path.join('.genos', 'agents', agent.id + '-calibrated.yaml');
    runGenos(['agent', 'create', '--name', agent.id, '--role', agent.role, '--out', base]);
    const drives = Object.entries(agent.drives ?? {}).flatMap(([name, delta]) => (
      delta === 0 ? [] : ['--drive', name + '=' + delta]
    ));
    if (drives.length > 0) {
      runGenos(['agent', 'mutate', base, ...drives, '--out', calibrated]);
    }
    records.push({
      agent_id: agent.id,
      role: agent.role,
      base_genome: path.join(workspace, base),
      calibrated_genome: drives.length > 0 ? path.join(workspace, calibrated) : path.join(workspace, base),
      calibration_deltas: agent.drives ?? {},
    });
  }
  fs.writeFileSync(path.join(runDir, 'fleet-bootstrap.json'), JSON.stringify(records, null, 2));
  return records;
}

function score(agent, required) {
  if (required.length === 0) return 1;
  const total = required.reduce((sum, capability) => sum + (agent.capabilities[capability] ?? 0), 0);
  return total / required.length;
}

function assignTask(task) {
  const benchmark = benchmarkById.get(task.benchmark_id);
  if (!benchmark) throw new Error('Unknown benchmark in backlog: ' + task.benchmark_id);
  const ranked = fleet.agents
    .filter((agent) => agent.id !== policy.orchestrator_id)
    .map((agent) => ({ agent, fit_score: Number(score(agent, benchmark.required_capabilities).toFixed(3)) }))
    .sort((a, b) => b.fit_score - a.fit_score || a.agent.id.localeCompare(b.agent.id));
  const selected = ranked.slice(0, policy.selection.agents_per_task);

  return {
    task_id: task.id,
    benchmark_id: task.benchmark_id,
    title: benchmark.title,
    priority: task.priority,
    status: task.status,
    deliverable: task.deliverable,
    budget: backlog.default_budget,
    selected_agents: selected.map(({ agent, fit_score }) => ({
      agent_id: agent.id,
      role: agent.role,
      fit_score,
      fit_status: fit_score >= policy.selection.minimum_fit_score ? 'qualified' : 'support_only',
      required_capabilities: benchmark.required_capabilities,
    })),
    review_agent: {
      agent_id: 'evidence-auditor',
      role: 'benchmark_evidence_auditor',
      policy: 'must approve evidence before merge or public claim',
    },
    rejected_candidates: ranked
      .filter(({ agent }) => !selected.some(({ agent: chosen }) => chosen.id === agent.id))
      .map(({ agent, fit_score }) => ({ agent_id: agent.id, fit_score })),
    protocol: [
      'snapshot parent baseline',
      'fork one branch per hypothesis or treatment',
      'mutate only the branch genome and budget',
      'run benchmark inside the isolated world',
      'record tool events, costs, tokens and artifacts',
      'diff branch against parent and siblings',
      'replay the winning and failing trajectories',
      'submit evidence to the auditor',
      'merge only after auditor approval',
    ],
  };
}

async function studioRequest(endpoint, options = {}) {
  const response = await fetch(studioUrl + endpoint, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + studioToken,
      'X-Access-Key': studioToken,
      'X-CSRF-Token': 'genos-benchmark-fleet-' + runId,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.text();
  let parsed = body;
  try { parsed = JSON.parse(body); } catch (_) {}
  if (!response.ok) {
    throw new Error('Studio ' + response.status + ' on ' + endpoint + ': ' + body);
  }
  return parsed;
}

async function ensureStudioWorkspace() {
  const workspaces = await studioRequest('/api/workspaces');
  const existing = Array.isArray(workspaces)
    ? workspaces.find((item) => item.name === 'Benchmarks' || item.title === 'Benchmarks')
    : null;
  if (existing) return { id: existing.id || 'ws-benchmarks', created: false };
  const created = await studioRequest('/api/workspaces', {
    method: 'POST',
    body: {
      name: 'Benchmarks',
      language: 'Rust',
      visibility: 'Private',
      description: 'GenOS benchmark fleet workspace and evidence ledger',
    },
  });
  return { id: created.workspace.id, created: true };
}

async function deployStudioAgent(agent, workspaceId, parentAgentId, taskIds) {
  const name = 'Benchmarks / ' + agent.id;
  const existingAgents = await studioRequest('/api/agents');
  const existing = Array.isArray(existingAgents)
    ? existingAgents.find((item) => item.name === name && item.fleetId === fleet.fleet_id)
    : null;
  if (existing) return { id: existing.id, name, created: false };

  const deployed = await studioRequest('/api/deploy', {
    method: 'POST',
    body: {
      name,
      role: agent.role,
      agentType: 'GenOS',
      modelTier: 'Local',
      language: 'Rust',
      workspaceIsolation: 'Branch',
      workspaceId,
      fleetId: fleet.fleet_id,
      parentAgentId,
      lineageRelation: parentAgentId ? 'fleet_member' : 'root_orchestrator',
      prompt: 'Coordinate and execute GenOS benchmark tasks: ' + taskIds.join(', '),
      about: JSON.stringify({
        genomeId: agent.id,
        genomePath: path.join(workspace, '.genos', 'agents', agent.id + '-calibrated.yaml'),
        capabilities: agent.capabilities,
        calibrationDeltas: agent.drives,
        taskIds,
      }),
    },
  });
  return { id: deployed.agentId, name, created: true };
}

async function syncFleetToStudio(assignments) {
  const studioWorkspace = await ensureStudioWorkspace();
  const taskIdsByAgent = new Map(fleet.agents.map((agent) => [agent.id, []]));
  for (const assignment of assignments) {
    for (const selected of assignment.selected_agents) {
      taskIdsByAgent.get(selected.agent_id)?.push(assignment.task_id);
    }
  }

  const orchestrator = fleet.agents.find((agent) => agent.id === policy.orchestrator_id);
  const orchestratorRecord = await deployStudioAgent(
    orchestrator,
    studioWorkspace.id,
    null,
    assignments.map((assignment) => assignment.task_id),
  );
  const records = [{ ...orchestratorRecord, role: orchestrator.role }];

  for (const agent of fleet.agents.filter((item) => item.id !== policy.orchestrator_id)) {
    const record = await deployStudioAgent(
      agent,
      studioWorkspace.id,
      orchestratorRecord.id,
      taskIdsByAgent.get(agent.id) || [],
    );
    records.push({ ...record, role: agent.role });
  }

  for (const record of records) {
    await studioRequest('/api/agents/' + encodeURIComponent(record.id) + '/events', {
      method: 'POST',
      body: {
        eventType: 'BENCHMARK_FLEET_RECRUITED',
        action: 'RECRUIT',
        detail: 'Agent synchronized from the GenOS Benchmarks fleet',
        status: 'idle',
        currentTask: 'Awaiting benchmark branch allocation',
        payload: {
          fleetId: fleet.fleet_id,
          workspaceId: studioWorkspace.id,
          role: record.role,
          source: 'benchmarks/orchestrator.mjs',
        },
      },
    });
  }

  return { url: studioUrl, workspace: studioWorkspace, agents: records };
}

const bootstrapRecords = bootstrap ? calibrateAgents() : [];
const assignments = backlog.tasks
  .filter((task) => task.status !== 'done')
  .sort((a, b) => b.priority - a.priority)
  .map(assignTask);
const studioSync = syncStudio ? await syncFleetToStudio(assignments) : null;

const report = {
  run_id: runId,
  workspace: 'Benchmarks',
  orchestrator: policy.orchestrator_id,
  portfolio_id: portfolio.portfolio_id,
  backlog_id: backlog.backlog_id,
  fleet_id: fleet.fleet_id,
  bootstrap,
  assignments,
  controls: policy.coordination_policy,
  external_execution: 'blocked_until_dataset_and_runtime_approval',
  studio_sync: studioSync,
};

fs.writeFileSync(path.join(runDir, 'assignments.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(workspace, 'latest-run.json'), JSON.stringify({
  run_id: runId,
  assignments_file: path.relative(workspace, path.join(runDir, 'assignments.json')),
  assigned_tasks: assignments.length,
}, null, 2));

console.log(JSON.stringify({
  workspace: 'Benchmarks',
  run_id: runId,
  bootstrap,
  studio_sync: Boolean(studioSync),
  assigned_tasks: assignments.length,
  assignments_file: path.join(runDir, 'assignments.json'),
  top_assignments: assignments.map((task) => ({
    task_id: task.task_id,
    agents: task.selected_agents.map((agent) => agent.agent_id + ':' + agent.fit_score),
  })),
  bootstrap_records: bootstrapRecords.length,
  studio_agents: studioSync?.agents.length || 0,
}, null, 2));
