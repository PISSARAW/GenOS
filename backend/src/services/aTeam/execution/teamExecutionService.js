'use strict';

const runtime = require('../aTeamRuntime');
const runStore = require('../teamRunStore');
const learning = require('../learning/teamLearningService');
const { observeExecution } = require('./workGraphExecutionService');
const { runDependencyGraph } = require('./dependencyExecutionService');
const handoffs = require('../../aTeamHandoffEvidenceService');

async function executeTeamRun(input) {
  const run = await runStore.load(input.db, input.teamRunId);
  if (!run) throw coded('Unknown A-Team run.', 'ATEAM_RUN_UNKNOWN');
  assertLease(run, input.runnerToken);
  const plan = { ...input.plan, members: input.plan.members };
  const { now, sleep, deadline } = await timingFor(input, run);
  const refresh = () => observeWithLease(input, { plan, now, deadline });
  const launch = async (member) => {
    const snapshot = await refresh();
    const ownedNodes = snapshot.graph.nodes.filter((node) => node.memberId === member.memberId);
    if (!ownedNodes.length || ownedNodes.some((node) => node.status !== 'READY')) return false;
    const receipts = receiptsForMember(snapshot.graph, ownedNodes);
    return input.launch({ ...member, handoffContext: receipts,
      mission: handoffs.missionWithHandoffs(member.mission, receipts) });
  };
  const results = await runDependencyGraph({ db: input.db, plan, launch,
    options: { ...input.options, timeoutMs: Math.max(0, deadline - now()), onBlocked: input.onBlocked, onTick: refresh } });
  let observed;
  do {
    observed = await refresh();
    if (!observed.terminal) await sleep(input.options?.pollMs ?? 500);
  } while (!observed.terminal);
  return finalizeExecution({ ...input, run, plan, observed, results });
}

async function observeWithLease(input, state) {
  if (input.options?.onTick) await input.options.onTick();
  const run = await requireLease(input);
  return observeExecution({ ...input, plan: state.plan, run, expired: state.now() >= state.deadline });
}

async function requireLease(input) {
  const run = await runStore.load(input.db, input.teamRunId);
  assertLease(run, input.runnerToken);
  if (Date.parse(run.execution.runnerLease.expiresAt) - Date.now() < 120000) {
    return runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
      patch: { execution: { ...run.execution, runnerLease: { ...run.execution.runnerLease, expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() } } } });
  }
  return run;
}

function assertLease(run, token) {
  const lease = run?.execution?.runnerLease;
  const expiresAt = Date.parse(lease?.expiresAt);
  if (!token || lease?.token !== token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || run.status !== 'RUNNING') {
    throw coded('A-Team runner lease is absent, expired or superseded.', 'ATEAM_RUN_LEASE_LOST');
  }
}

async function finalizeExecution(input) {
  const { observed } = input;
  const statistical = await require('../../morphogenesis/capabilities/statisticalPromotionGate')
    .evaluateForNode(input.db, { nodeId: input.riskNodeId || input.teamRunId, contract: input.statisticalContract });
  const accepted = observed.promoted && observed.gate.passed && statistical.allowed;
  const status = accepted ? 'COMPLETED' : observed.graph.nodes.some((node) => node.status === 'FAILED') ? 'FAILED' : 'BLOCKED';
  let run = await requireLease(input);
  run = await runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { status, phase: 'INTEGRATION', execution: { ...run.execution,
      coverage: observed.coverage, integration: { accepted, failures: observed.observation, gate: observed.gate },
      schedulingResults: input.results } } });
  run = await runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision, patch: { phase: 'DEBRIEF' } });
  const evidenceIds = [...new Set([...observed.verdicts.values()].flatMap((verdict) => verdict.evidenceRefs))];
  const valid = new Set(evidenceIds);
  const completed = observed.graph.nodes.filter((node) => node.status === 'SUCCEEDED').length;
  await learning.persistTeamDebrief({ db: input.db, teamRunId: run.teamRunId, objectiveMet: accepted, evidenceIds,
    metrics: { completionRate: completed / observed.graph.nodes.length,
      handoffAcceptanceRate: observed.graph.edges.length ? acceptedHandoffs(observed.graph) : 1 },
    evidenceIsUsable: async ({ evidenceId }) => valid.has(evidenceId) });
  return { teamRunId: run.teamRunId, status, accepted, coverage: observed.coverage, results: input.results };
}

function receiptsForMember(graph, nodes) {
  const ids = new Set(nodes.map((node) => node.nodeId));
  return graph.edges.filter((edge) => ids.has(edge.toNode) && edge.handoff).map((edge) => edge.handoff);
}

function acceptedHandoffs(graph) {
  return graph.edges.filter((edge) => edge.accepted === true).length / graph.edges.length;
}

async function timingFor(input, run) {
  const now = input.options?.now || Date.now;
  const sleep = input.options?.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (input.options?.timeoutMs === Infinity) return { now, sleep, deadline: Infinity };
  let deadline = run.execution.deadlineAt ? Date.parse(run.execution.deadlineAt) : null;
  if (deadline === null) {
    deadline = now() + (input.options?.timeoutMs ?? 15 * 60 * 1000);
    await runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
      patch: { execution: { ...run.execution, deadlineAt: new Date(deadline).toISOString() } } });
  }
  if (!Number.isFinite(deadline)) throw coded('A-Team execution deadline is invalid.', 'ATEAM_DEADLINE_INVALID');
  return { now, sleep, deadline };
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { executeTeamRun, finalizeExecution, assertLease };
