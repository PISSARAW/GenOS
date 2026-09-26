'use strict';

const { buildVariantPlan } = require('./variants/variantRegistry');
const { planOrganizations } = require('./variants/teamOrganizationController');
const { compileWorkGraph } = require('./workGraph/workGraphCompiler');
const { allocateCriticalPathBudget } = require('./budget/criticalPathBudgetService');
const { assessBoundaryRisk } = require('./boundaries/boundaryRiskService');
const { assignBoundarySpanners } = require('./boundaries/boundarySpannerService');
const { composeMultiteam } = require('./multiteam/multiteamComposer');
const { buildOperationalPolicy } = require('./variants/operationalVariantPolicy');

function prepareDispatchPolicy(input = {}) {
  const mission = input.mission || {};
  const plan = buildVariantPlan({ ...mission, interfaceCount: countInterfaces(input.members), parallelWorkstreams: countIndependent(input.members) });
  const memberCount = declaredMemberCount(mission, plan, input.members);
  if (mission.variant && memberCount < plan.minMembers) throw coded(`Variant '${plan.variant}' requires at least ${plan.minMembers} members.`, 'ATEAM_VARIANT_TEAM_TOO_SMALL');
  if (plan.variant === 'multiteam' && !Array.isArray(mission.teams)) throw coded('Multiteam dispatch requires explicit subteam definitions.', 'ATEAM_MULTITEAM_INPUT_REQUIRED');
  const members = applyMemberPolicy(attachStageContracts(input.members || [], mission), plan);
  const graph = compileWorkGraph({ teamRunId: input.teamRunId, members });
  const boundaries = assessBoundaries(graph, members);
  const budget = allocateBudget(input.totalBudget, members, graph);
  const details = variantRuntime({ mission, plan, members, boundaries });
  const operational = buildOperationalPolicy({ mission, plan, members, boundaries });
  const policy = {
    ...plan, ...details, ...operational, boundaryAssessment: boundaries,
    boundarySpanners: assignBoundarySpanners(boundaries.interfaces, members), budgetAllocation: budget
  };
  return { members: attachVariantInstructions(attachBudgets(members, budget), policy), policy };
}

function declaredMemberCount(mission, plan, members) {
  if (plan.variant !== 'multiteam' || !Array.isArray(mission.teams)) return members?.length || 0;
  return mission.teams.reduce((count, team) => count + (Array.isArray(team.members) ? team.members.length : 0), 0);
}

function attachStageContracts(members, mission) {
  const contracts = mission.stageContracts || {};
  return members.map((member) => {
    const key = memberDomain(member);
    const contract = Array.isArray(contracts) ? contracts.find((item) => item.memberId === memberKey(member) || item.domain === key) : contracts[key];
    return contract ? { ...member, inputSchema: contract.inputSchema || member.inputSchema, outputSchema: contract.outputSchema || member.outputSchema } : member;
  });
}

function variantRuntime({ mission, plan, members, boundaries }) {
  const runtime = { phases: [], commanderMemberId: null, authorityMatrix: null, multiteamPlan: null };
  if (['tiger_team', 'incident_command'].includes(plan.variant)) runtime.commanderMemberId = chooseCommander(members);
  if (plan.variant === 'matrix_team') runtime.authorityMatrix = matrixAuthority(mission);
  if (plan.variant === 'multiteam' && Array.isArray(mission.teams)) {
    runtime.multiteamPlan = composeMultiteam({ teams: mission.teams, contracts: mission.interTeamContracts, limits: mission.multiteamLimits });
  }
  if (plan.variant === 'adaptive') runtime.phases = adaptivePhases(mission);
  if (plan.variant === 'boundary_spanner') runtime.boundaryOwnersRequired = boundaries.level === 'high';
  return runtime;
}

function chooseCommander(members) {
  const member = members.find((entry) => /commander|lead|manager/i.test(entry.role || '')) || members[0];
  return member?.memberId || member?.agentId || member?.workerId || memberDomain(member || {});
}

function matrixAuthority(mission) {
  return {
    functionalOwnerId: mission.functionalOwnerId || null,
    productOwnerId: mission.productOwnerId || null,
    axes: ['functional', 'product'], decisionRule: 'consult_both_owners'
  };
}

function adaptivePhases(mission) {
  if (!Array.isArray(mission.phases)) return [];
  const context = { ...mission };
  delete context.variant;
  return planOrganizations({ mission: context, phases: mission.phases });
}

function attachVariantInstructions(members, policy) {
  return members.map((member) => ({
    ...member,
    mission: `${member.mission || ''}\n\nTEAM ORGANIZATION POLICY\n${policy.variant}: ${policy.communication}; authority=${policy.authority}. ${instructionFor(member, policy)}`.trim()
  }));
}

function instructionFor(member, policy) {
  if (['pipeline', 'project_dag'].includes(policy.variant) && (member.inputSchema || member.outputSchema)) {
    return `Satisfy stage schemas exactly. Input: ${JSON.stringify(member.inputSchema || {})}. Output: ${JSON.stringify(member.outputSchema || {})}.`;
  }
  const ownedInterfaces = policy.boundarySpanners.filter((entry) => entry.ownerMemberId === memberKey(member));
  if (ownedInterfaces.length) return `Own and validate these interfaces only: ${ownedInterfaces.map((entry) => entry.boundaryId).join(', ')}.`;
  if (memberKey(member) === policy.commanderMemberId) return 'Coordinate the incident response within the declared team scope and escalate decisions outside your authority.';
  if (policy.variant === 'matrix_team') return `Consult functional owner ${policy.authorityMatrix.functionalOwnerId || 'TBD'} and product owner ${policy.authorityMatrix.productOwnerId || 'TBD'} for cross-axis decisions.`;
  if (policy.variant === 'boundary_spanner') return 'Own only the interfaces assigned to you; validate both sides of each contract.';
  if (policy.variant === 'relay_team') return 'Receive context from the previous owner and pass a typed, evidence-backed handoff to the next owner.';
  return 'Follow the persisted WorkGraph and the team contract for this responsibility.';
}

function countInterfaces(members) {
  return (Array.isArray(members) ? members : []).reduce((count, member) => count + (member.dependsOn || []).length, 0);
}

function countIndependent(members) {
  return (Array.isArray(members) ? members : []).filter((member) => !(member.dependsOn || []).length).length;
}

function applyMemberPolicy(members, plan) {
  const source = Array.isArray(members) ? members : [];
  if (['pipeline', 'relay_team'].includes(plan.variant)) return serializeMembers(orderByDependencies(source), plan.variant);
  if (plan.variant === 'cross_functional_pod') return consultPeerDomains(source);
  return source;
}

function orderByDependencies(members) {
  const graph = compileWorkGraph({ members });
  const position = new Map(members.map((member, index) => [member, index]));
  return [...members].sort((left, right) => {
    const leftKey = left.memberId || left.agentId || left.workerId || memberDomain(left);
    const rightKey = right.memberId || right.agentId || right.workerId || memberDomain(right);
    return (graph.memberStages[leftKey] || 0) - (graph.memberStages[rightKey] || 0) || position.get(left) - position.get(right);
  });
}

function serializeMembers(members, variant) {
  return members.map((member, index) => {
    if (!index) return { ...member, pipelineStage: 0 };
    const predecessor = members[index - 1];
    const predecessorDomain = memberDomain(predecessor);
    return {
      ...member,
      dependsOn: [...new Set([...(member.dependsOn || []), predecessorDomain])],
      pipelineStage: index,
      contextHandoff: variant === 'relay_team' ? 'EXCLUSIVE_SERIAL_TRANSFER' : 'TYPED_STAGE_HANDOFF'
    };
  });
}

function consultPeerDomains(members) {
  const domains = members.map(memberDomain);
  return members.map((member) => ({
    ...member,
    consults: [...new Set([...(member.consults || []), ...domains.filter((domain) => domain !== memberDomain(member))])],
    communicationCadence: 'CONTINUOUS_SYNC'
  }));
}

function memberDomain(member) {
  return member.domain || member.subSystem || member.label || member.role;
}

function memberKey(member) {
  return [member.memberId, member.agentId, member.workerId, member.domain, member.subSystem, member.label, member.role].find(Boolean);
}

function assessBoundaries(graph, members) {
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const pairs = new Map();
  for (const edge of graph.edges) {
    const from = memberDomainForNode(nodeById.get(edge.fromNode), members);
    const to = memberDomainForNode(nodeById.get(edge.toNode), members);
    if (from && to && from !== to) pairs.set(`${from}:${to}`, { id: `${from}:${to}`, from, to });
  }
  const interfaces = [...pairs.values()];
  const aggregate = assessBoundaryRisk({ interfaceCount: interfaces.length, domainCount: new Set(interfaces.flatMap((item) => [item.from, item.to])).size, changeRate: 0, criticality: interfaces.length ? 0.5 : 0, historicalFailures: 0 });
  return { ...aggregate, interfaces };
}

function memberDomainForNode(node, members) {
  if (!node) return null;
  const member = members.find((entry) => memberKey(entry) === node.memberId);
  return member ? memberDomain(member) : node.domain;
}

function allocateBudget(totalBudget, members, graph) {
  const amount = Number(totalBudget);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const criticalMembers = criticalMemberKeys(graph);
  return allocateCriticalPathBudget({
    totalBudget: amount, criticalPath: [...criticalMembers],
    work: members.map(budgetItem)
  });
}

function criticalMemberKeys(graph) {
  const keys = new Set();
  for (const nodeId of graph.criticalPath.nodeIds) {
    const node = graph.nodes.find((entry) => entry.nodeId === nodeId);
    if (node?.memberId) keys.add(node.memberId);
  }
  return keys;
}

function budgetItem(member) {
  return {
    id: memberKey(member), criticality: criticalityFor(member.criticality),
    uncertainty: member.uncertainty || 0.5, interfaceComplexity: member.interfaceComplexity || 0.5,
    impact: member.impact || 0.5, confidence: member.confidence || 0.7, urgency: member.urgency || 0.5
  };
}

function criticalityFor(value) {
  if (value === 'critical') return 1;
  if (value === 'high') return 0.8;
  return 0.4;
}

function attachBudgets(members, budget) {
  if (!budget) return members;
  const amounts = new Map(budget.allocations.map((entry) => [entry.id, Math.floor(entry.amount)]));
  return members.map((member) => ({ ...member, executionBudgetTokens: amounts.get(memberKey(member)) || 0 }));
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { prepareDispatchPolicy, applyMemberPolicy, assessBoundaries, allocateBudget };
