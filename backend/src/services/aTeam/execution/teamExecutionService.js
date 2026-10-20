'use strict';

const runtime = require('../aTeamRuntime');
const runStore = require('../teamRunStore');
const learning = require('../learning/teamLearningService');
const { observeExecution } = require('./workGraphExecutionService');
const { runDependencyGraph } = require('./dependencyExecutionService');
const handoffs = require('../../aTeamHandoffEvidenceService');
const { closeMission } = require('../../missionClosureService');
const { digest } = require('../../evidenceContractService');

async function executeTeamRun(input) {
  const run = await runStore.load(input.db, input.teamRunId);
  if (!run) throw coded('Unknown A-Team run.', 'ATEAM_RUN_UNKNOWN');
  assertLease(run, input.runnerToken);
  if (run.execution?.organizationPolicy?.variant === 'multiteam') {
    return executeMultiteamRun(input, run);
  }
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

async function executeMultiteamRun(input, run) {
  if (typeof input.executeTeam !== 'function') {
    throw coded('Multiteam completion requires a verified child TeamRun executor.',
      'ATEAM_MTS_EXECUTOR_REQUIRED');
  }
  const runtime = require('../multiteam/programRuntimeService');
  const plan = run.execution.organizationPolicy.multiteamPlan;
  const programId = `${run.teamRunId}:program`;
  let program = await require('../../topologySessionStore').load(input.db, programId);
  if (!program) {
    await runtime.createProgramRun({ db: input.db, programId,
      parentTeamRunId: run.teamRunId, teams: plan.teams, contracts: plan.contracts,
      council: plan.council, systemObjective: run.goal, globalBudget: plan.budget?.global });
  }
  const result = await runtime.advanceProgramRun({ db: input.db, programId,
    orchestratorId: input.orchestratorId, executeTeam: input.executeTeam });
  const completionInput = multiteamClosureInput(run, result);
  const completion = closeMission(completionInput);
  const accepted = completion.success;
  const status = accepted ? 'COMPLETED' : result.status === 'FAILED' ? 'FAILED' : 'BLOCKED';
  const latest = await requireLease(input);
  await require('../aTeamRuntime').transitionRun({ db: input.db, teamRunId: latest.teamRunId,
    revision: latest.revision, patch: { status, phase: 'DEBRIEF', execution: {
      ...latest.execution, multiteamProgram: result, integration: { accepted, completion }
    } } });
  return { teamRunId: run.teamRunId, programId, status, accepted, program: result,
    completion, completionInput };
}

function multiteamClosureInput(run, program) {
  const records = program.teams.map((team) => {
    const completed = team.status === 'SUCCEEDED' && team.receipt?.verified === true;
    const content = { schema: 'genos.ateam-subteam-closure-proof/v1',
      missionId: run.missionId, workerId: team.teamId,
      result: { status: completed ? 'completed' : 'partial', verified: completed }, receipt: team.receipt };
    const proof = { reference: digest(content), content, source: 'a_team_program' };
    return { member: { memberId: team.teamId, status: completed ? 'completed' : 'partial',
      evidenceRefs: completed ? [proof.reference] : [] }, proof };
  });
  const receipt = { schema: 'genos.ateam-program-oracle/v1', missionId: run.missionId,
    programId: program.programId, teams: program.teams };
  return { missionId: run.missionId, topology: 'a_team_multiteam', lifecycleState: 'completed',
    producerId: run.missionId, requiredMemberIds: program.teams.map((team) => team.teamId),
    members: records.map((record) => record.member), evidenceProofs: records.map((record) => record.proof),
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants: [{ id: 'subteams_verified', passed: program.status === 'SUCCEEDED' }],
    oracle: { status: program.status === 'SUCCEEDED' ? 'verified' : 'failed', independent: true,
      verifierIds: ['a-team-program-completion-inspector'],
      evidenceRefs: records.map((record) => record.proof.reference), receipt,
      receiptHash: digest(receipt) } };
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
  const audit = await require('./teamAuditService').buildTeamAudit(input.db, input.run, observed);
  const completionInput = teamClosureInput({ ...input, statistical, audit });
  const completion = closeMission(completionInput);
  const accepted = completion.success;
  const status = accepted ? 'COMPLETED' : observed.graph.nodes.some((node) => node.status === 'FAILED') ? 'FAILED' : 'BLOCKED';
  let run = await requireLease(input);
  run = await runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { status, phase: 'INTEGRATION', execution: { ...run.execution,
      coverage: observed.coverage, integration: { accepted, failures: observed.observation,
        gate: observed.gate, audit, completion },
      schedulingResults: input.results } } });
  run = await runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision, patch: { phase: 'DEBRIEF' } });
  const evidenceIds = [...new Set([...observed.verdicts.values()].flatMap((verdict) => verdict.evidenceRefs))];
  const valid = new Set(evidenceIds);
  const completed = observed.graph.nodes.filter((node) => node.status === 'SUCCEEDED').length;
  await learning.persistTeamDebrief({ db: input.db, teamRunId: run.teamRunId, objectiveMet: accepted, evidenceIds,
    metrics: { completionRate: completed / observed.graph.nodes.length,
      handoffAcceptanceRate: observed.graph.edges.length ? acceptedHandoffs(observed.graph) : 1 },
    evidenceIsUsable: async ({ evidenceId }) => valid.has(evidenceId) });
  return { teamRunId: run.teamRunId, status, accepted, coverage: observed.coverage,
    results: input.results, audit, completion, completionInput };
}

function memberClosureRecord(input, member) {
  const verdict = input.observed.verdicts.get(member.workerId);
  const completed = input.observed.statuses.get(member.workerId) === 'completed'
    && verdict?.promoted === true;
  const content = { schema: 'genos.ateam-member-closure-proof/v1',
    missionId: input.run.missionId, workerId: member.workerId,
    result: { status: completed ? 'completed' : 'partial', verified: completed },
    reportHash: verdict?.report ? digest(verdict.report) : null,
    sourceEvidenceRefs: verdict?.evidenceRefs || [] };
  const proof = { reference: digest(content), content, source: 'a_team_work_graph' };
  return { member: { memberId: member.workerId, status: completed ? 'completed' : 'partial',
    evidenceRefs: completed ? [proof.reference] : [] }, proof };
}

function teamOracle(input, records) {
  const receipt = { schema: 'genos.ateam-independent-observer/v1',
    missionId: input.run.missionId, observerReport: input.observed.observation.observerReport,
    qualityGate: input.observed.gate };
  return { status: input.observed.gate.passed ? 'verified' : 'failed', independent: true,
    verifierIds: ['a-team-integration-observer'],
    evidenceRefs: records.map((record) => record.proof.reference),
    receipt, receiptHash: digest(receipt) };
}

function teamClosureInput(input) {
  const records = input.plan.members.map((member) => memberClosureRecord(input, member));
  const invariants = [
    { id: 'work_graph_promoted', passed: input.observed.promoted === true },
    { id: 'quality_gate_passed', passed: input.observed.gate.passed === true },
    { id: 'statistical_gate_allowed', passed: input.statistical.allowed === true }
  ];
  return { missionId: input.run.missionId, topology: 'a_team', lifecycleState: 'completed',
    producerId: input.run.missionId, requiredMemberIds: input.plan.members.map((member) => member.workerId),
    members: records.map((record) => record.member), evidenceProofs: records.map((record) => record.proof),
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants, oracle: teamOracle(input, records) };
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

module.exports = { executeTeamRun, finalizeExecution, assertLease, teamClosureInput };
