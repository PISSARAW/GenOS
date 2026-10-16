'use strict';

const runStore = require('../aTeam/teamRunStore');
const graphStore = require('../aTeam/workGraph/workGraphStore');
const { VARIANTS } = require('../aTeam/variants/variantRegistry');
const { digest, refusal } = require('../topologySnapshotContract');

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

function fail(code, message) { throw refusal(code, message); }
function known(value, fallback) { return value === undefined ? fallback : value; }

function tenantMatch(scope, workspace) {
  return scope.params.length === 2 && /organization_id\s*=\s*\?/.test(scope.clause)
    && /project_id\s*=\s*\?/.test(scope.clause)
    && workspace.organization_id === scope.params[0] && workspace.project_id === scope.params[1];
}

function legacyMatch(scope, workspace) {
  return scope.params.length === 0 && /organization_id\s+IS\s+NULL/i.test(scope.clause)
    && /project_id\s+IS\s+NULL/i.test(scope.clause)
    && workspace.organization_id == null && workspace.project_id == null;
}

function scopedWorkspace(scope, workspace) {
  if (!Array.isArray(scope?.params) || typeof scope.clause !== 'string') return false;
  return tenantMatch(scope, workspace) || legacyMatch(scope, workspace);
}

async function boundAgent(context, run) {
  const { db, agentId, workspaceId } = context;
  const agent = await db.get('SELECT id, workspace_id, status FROM agents WHERE id = ?', agentId);
  const workspace = await db.get('SELECT id, organization_id, project_id FROM workspaces WHERE id = ?', workspaceId);
  const participant = run.missionId === agentId
    || run.members.some((member) => member.agentId === agentId || member.workerId === agentId);
  if (!agent || !workspace || agent.workspace_id !== workspaceId || !participant
    || !scopedWorkspace(context.scope, workspace)) {
    fail('ATEAM_SNAPSHOT_OWNER_MISMATCH', 'Agent, A-Team run and scoped workspace are not bound.');
  }
  return { agentStatus: agent.status, organizationId: workspace.organization_id,
    projectId: workspace.project_id };
}

function selectedVariant(run, requested) {
  const variant = run.execution?.organizationPolicy?.variant;
  if (!Object.hasOwn(VARIANTS, variant)) {
    fail('ATEAM_SNAPSHOT_VARIANT_UNVERIFIED', 'Persisted A-Team variant is missing or unknown.');
  }
  if (requested !== 'default' && requested !== variant) {
    fail('ATEAM_SNAPSHOT_VARIANT_MISMATCH', 'Persisted A-Team variant differs from snapshot request.');
  }
  return variant;
}

function handoffRefs(graph) {
  return graph.edges.filter((edge) => edge.handoff).map((edge) => ({
    fromNode: edge.fromNode, toNode: edge.toNode, hash: digest(edge.handoff)
  }));
}

function variantEvidence(input) {
  const { variant, run, graph, policy, handoffs } = input;
  const members = run.members;
  const fields = {
    expert_committee: { expertise: members.map((m) => ({ id: m.memberId, expertise: m.expertise })) },
    pipeline: { stages: graph.memberStages, completedNodes: graph.nodes.filter((n) => n.status === 'SUCCEEDED').map((n) => n.nodeId), handoffs },
    project_dag: { layers: graph.layers, nodeStages: graph.nodeStages, dependencies: graph.edges.map((e) => [e.fromNode, e.toNode]) },
    cross_functional_pod: { responsibilities: members.map((m) => ({ id: m.memberId, owns: m.ownedResponsibilities, consults: m.consults })) },
    boundary_spanner: { interfaces: known(policy.interfaceContracts, []), owners: known(policy.boundarySpanners, []) },
    matrix_team: { authorityMatrix: known(policy.authorityMatrix, null), authorityMatrixByDecisionType: known(policy.authority_matrix_by_decision_type, null), raciDimensions: known(policy.raci_dimensions, null), escalationPaths: known(policy.escalation_paths, null), transactionalDisagreementResolution: known(policy.transactional_disagreement_resolution, null), memberAuthorities: members.map((m) => ({ id: m.memberId, authority: m.authority })) },
    tiger_team: { commanderMemberId: known(policy.commanderMemberId, null), mandate: known(policy.urgentMandate, null), leases: members.map((m) => ({ id: m.memberId, tools: m.toolLease })) },
    incident_command: { commanderMemberId: known(policy.commanderMemberId, null), mandatoryIcsRoles: known(policy.mandatory_ics_roles, null), sitrepCadence: known(policy.sitrep_cadence, null), incidentTimeline: known(policy.incident_timeline, null), objectivesPerPeriod: known(policy.objectives_per_operational_period, null), spanOfControl: known(policy.span_of_control, null), structuredHandover: known(policy.structured_handover, null), structuredClosure: known(policy.structured_closure, null), deadlineAt: known(run.execution?.deadlineAt, null), incidentState: known(run.execution?.incidentState, null) },
    multiteam: { planHash: policy.multiteamPlan ? digest(policy.multiteamPlan) : null, interTeamContracts: known(policy.interTeamContracts, []) },
    adaptive: { phases: known(policy.phases, []), continuousStaffingByCapabilityGap: known(policy.continuous_staffing_by_capability_gap, null), realRecruitment: known(policy.real_recruitment, null), morphogenesisTransition: known(policy.transactional_morphogenesis_transition, null), memoryTransfer: known(policy.memory_transfer, null), reconfigurationCost: known(policy.reconfiguration_cost, null), hysteresisAntiThrashing: known(policy.hysteresis_anti_thrashing, null), staffingHash: run.execution?.staffing ? digest(run.execution.staffing) : null },
    relay_team: { handoffs, owners: members.map((m) => m.memberId), relayHash: run.execution?.relayState ? digest(run.execution.relayState) : null }
  };
  return { variant, ...fields[variant] };
}

async function capture(context) {
  const run = await runStore.load(context.db, context.sessionId);
  if (!run) fail('ATEAM_SNAPSHOT_RUN_UNKNOWN', 'A-Team run was not found.');
  const owner = await boundAgent(context, run);
  const variant = selectedVariant(run, context.variantId);
  const graph = await graphStore.load(context.db, run.workGraphId);
  if (!graph || graph.teamRunId !== run.teamRunId) {
    fail('ATEAM_SNAPSHOT_GRAPH_MISMATCH', 'Canonical A-Team WorkGraph is missing or belongs to another run.');
  }
  const refreshed = await runStore.load(context.db, run.teamRunId);
  const refreshedGraph = await graphStore.load(context.db, graph.workGraphId);
  if (refreshed?.revision !== run.revision || digest(refreshed) !== digest(run)
    || refreshedGraph?.revision !== graph.revision || digest(refreshedGraph) !== digest(graph)) {
    fail('ATEAM_SNAPSHOT_CONCURRENT_CHANGE', 'A-Team run or WorkGraph changed during capture.');
  }
  const policy = run.execution.organizationPolicy;
  const handoffs = handoffRefs(graph);
  return { policyVersion: 1, boundary: {
    runId: run.teamRunId, runRevision: run.revision, graphId: graph.workGraphId,
    graphRevision: graph.revision, runStatus: run.status, phase: run.phase,
    agentStatus: owner.agentStatus, organizationId: owner.organizationId,
    projectId: owner.projectId
  }, components: [
    { id: 'team-run', status: 'reference-only', reference: {
      runId: run.teamRunId, revision: run.revision, stateHash: digest(run),
      deadlineAt: run.execution?.deadlineAt || null,
      lease: run.execution?.runnerLease ? {
        ownerId: run.execution.runnerLease.ownerId,
        expiresAt: run.execution.runnerLease.expiresAt,
        tokenHash: digest(run.execution.runnerLease.token)
      } : null
    } },
    { id: 'work-graph', status: 'reference-only', reference: {
      graphId: graph.workGraphId, revision: graph.revision, stateHash: digest(graph),
      handoffs, evidenceHash: digest({ nodes: graph.nodes, edges: graph.edges })
    } },
    { id: 'variant-policy', status: 'captured', payload: variantEvidence({ variant, run, graph, policy, handoffs }) }
  ] };
}

async function preflightRestore(context, manifest) {
  const boundary = manifest.boundary;
  if (!TERMINAL.has(boundary.runStatus)) {
    return { ok: false, reasons: ['A-Team run is not terminal; members may still write.'] };
  }
  const run = await runStore.load(context.db, context.sessionId);
  if (run?.execution?.runnerLease) {
    return { ok: false, reasons: ['A-Team execution lease is still present.'] };
  }
  if (boundary.agentStatus === 'running') {
    return { ok: false, reasons: ['Agent is still running.'] };
  }
  return { ok: true, plan: { restore: 'workspace-only', collectiveState: 'verify-only',
    runId: boundary.runId, runRevision: boundary.runRevision,
    graphRevision: boundary.graphRevision, variant: manifest.components.find((item) => item.id === 'variant-policy')?.payload.variant } };
}

module.exports = { capture, preflightRestore };
