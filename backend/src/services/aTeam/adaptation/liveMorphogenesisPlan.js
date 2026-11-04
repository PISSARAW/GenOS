'use strict';

const collective = require('../../collectiveStateService');
const { compileWorkGraph } = require('../workGraph/workGraphCompiler');
const { findMember } = require('../../qualityElevation/qualityFinalPlan');
const evidence = require('./liveMorphogenesisEvidence');
const policy = require('./liveMorphogenesisPolicy');
const preparation = require('./liveMorphogenesisPreparation');

function nextMembers(run, target, source) {
  const config = policy.effective(run).replacement;
  return run.members.map(member => member.memberId !== target.memberId ? member : {
    ...member, workerId: policy.candidateId(run), agentId: policy.candidateId(run), role: config.role,
    mission: `${member.mission}\n\nADAPTIVE REPLACEMENT CONTEXT (observed data):\n`
      + `${config.missionAppend}\nSource observations: ${JSON.stringify({ defects: source.defects, signals: source.signals || [] })}\n`
      + `Source receipt: ${source.receiptId}. Preserve the original task and all quality obligations.`
  });
}

function projectedGraph(run, before, members) {
  const graph = JSON.parse(JSON.stringify(compileWorkGraph({ workGraphId: before.workGraphId,
    teamRunId: run.teamRunId, members, createdAt: before.createdAt })));
  const prior = new Map(before.nodes.map(node => [node.nodeId, node]));
  const changed = new Set(graph.nodes.filter(node => prior.get(node.nodeId)?.ownerAgentId !== node.ownerAgentId)
    .map(node => node.nodeId));
  const affected = new Set(require('./repairCoordinatorService').downstreamClosure(changed, graph.edges));
  graph.nodes = graph.nodes.map(node => affected.has(node.nodeId) ? node : prior.get(node.nodeId) || node);
  graph.edges = graph.edges.map(edge => {
    const same = before.edges.find(old => old.fromNode === edge.fromNode && old.toNode === edge.toNode);
    return !affected.has(edge.fromNode) && !affected.has(edge.toNode) && same ? same : edge;
  });
  return { graph, affectedNodeIds: [...affected], invalidatedHandoffDigests: before.edges
    .filter(edge => affected.has(edge.fromNode) || affected.has(edge.toNode))
    .map(edge => edge.handoff?.digest).filter(Boolean) };
}

async function build(input) {
  const { run, graph, source } = input;
  const selected = policy.effective(run);
  const target = findMember(run.members, selected.targetMember);
  const next = nextMembers(run, target, source);
  const projection = projectedGraph(run, graph, next);
  const old = await preparation.assertPending(input.db, run, target.workerId);
  const candidate = await preparation.assertPending(input.db, run, policy.candidateId(run));
  const controller = await preparation.controllerScope(input.db, run);
  for (const actor of [old, candidate]) {
    if (actor.organization_id !== controller.organization_id || actor.project_id !== controller.project_id
      || actor.workspace_id !== controller.workspace_id) throw policy.fail('ATEAM_LIVE_MORPH_SCOPE_MISMATCH', 'Pending actors must share the controller workspace and tenant.');
  }
  const binding = { schema: 'genos.a-team-pending-replacement/v1', teamRunId: run.teamRunId,
    runtimeMissionId: run.execution.runtimeMissionId, runnerLeaseDigest: evidence.digest(input.runnerToken),
    policyDigest: evidence.digest(run.adaptiveMorphogenesis), selectionDigest: evidence.digest(selected), memberId: target.memberId,
    ...(require('./liveMorphogenesisAutomaticPolicy').enabled(run.adaptiveMorphogenesis) ? { selection: selected } : {}),
    source, beforeMembersHash: evidence.rosterHash(run.members), afterMembersHash: evidence.rosterHash(next),
    priorWorkerId: old.id, candidateWorkerId: candidate.id, priorRole: old.role,
    reserveRole: candidate.role, nextRole: selected.replacement.role,
    runRevision: run.revision, graphRevision: graph.revision,
    beforeGraphHash: evidence.graphShape(graph), afterGraphHash: evidence.graphShape(projection.graph),
    budgets: await budgets(input.db, run), taskRecords: taskRecords(graph),
    affectedNodeIds: projection.affectedNodeIds, invalidatedHandoffDigests: projection.invalidatedHandoffDigests };
  const req = { user: { keyId: controller.id }, tenant: {
    organizationId: controller.organization_id, projectId: controller.project_id } };
  const plan = { id: `ateam-live-${evidence.digest([run.teamRunId, source.receiptId]).slice(7, 39)}`,
    missionId: run.execution.runtimeMissionId, targetTopology: 'a_team',
    targetOrganization: run.organization, reason: 'observed_source_signal_pending_replacement',
    expectedGain: 0.5, expectedRisk: 0.05,
    collectiveStorageKey: `mission:${run.execution.runtimeMissionId}`, aTeamPendingReplacement: binding,
    actions: [{ type: 'rebind', agentId: old.id, targetRole: candidate.role, targetParent: controller.id },
      { type: 'rebind', agentId: candidate.id, targetRole: binding.nextRole, targetParent: controller.id }] };
  return { plan, req, controller, collectiveState: await state(input.db, run, candidate.id) };
}

async function state(db, run, candidateId) {
  const ids = [...new Set([run.missionId, ...run.members.map(member => member.workerId), candidateId])];
  const agents = {};
  for (const id of ids) {
    const row = await db.get('SELECT id,role,status,parent_agent_id FROM agents WHERE id=?', id);
    if (!row) throw policy.fail('ATEAM_LIVE_MORPH_MEMBER_MISSING', 'A real actor disappeared.');
    agents[id] = { id, role: row.role, status: row.status, parent: row.parent_agent_id, capabilities: [] };
  }
  return collective.deserializeState({ mission: { id: run.execution.runtimeMissionId }, agents,
    topologyState: { topology: 'a_team', organization: run.organization, activeSubgraphs: [] },
    budgets: { total: run.members.reduce((total, member) => total + member.executionBudgetTokens, 0),
      allocated: run.members.reduce((total, member) => total + member.executionBudgetTokens, 0), remaining: 0, perAgent: {} } });
}

module.exports = { build, nextMembers, projectedGraph };

async function budgets(db, run) {
  const rows = [];
  for (const member of run.members) {
    const execution = await db.get(`SELECT status,metrics_json FROM strategy_execution_runs
      WHERE agent_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`, member.workerId);
    rows.push(budgetFor(member, execution));
  }
  return rows;
}

function budgetFor(member, execution) {
  const metrics = execution ? JSON.parse(execution.metrics_json || '{}') : null;
  const spent = execution ? metrics.billableTokens ?? metrics.tokens : 0;
  const reserved = execution ? 0 : member.executionBudgetTokens;
  if (!Number.isSafeInteger(spent) || !Number.isSafeInteger(member.executionBudgetTokens)
    || spent < 0 || spent + reserved > member.executionBudgetTokens) {
    throw policy.fail('ATEAM_LIVE_MORPH_BUDGET_UNMEASURED', 'MORPH must conserve real measured spending and bounded allocations.');
  }
  return { memberId: member.memberId, workerId: member.workerId,
    limit: member.executionBudgetTokens, spent, reserved };
}
module.exports.budgets = budgets;

function taskRecords(graph) {
  return graph.nodes.map(node => ({ taskId: node.nodeId, memberId: node.memberId,
    ownerAgentId: node.ownerAgentId, contentDigest: evidence.graphShape({ nodes: [node], edges: [] }) }));
}
module.exports.taskRecords = taskRecords;
