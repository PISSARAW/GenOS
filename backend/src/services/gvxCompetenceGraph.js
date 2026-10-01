'use strict';

const { listEvents } = require('./gvxDevelopmentLedger');

const SUPPORTED = 'empirically_supported';

async function buildCompetenceGraph(db, scope) {
  const events = await listEvents(db, scope);
  const experiments = completedExperiments(events);
  const nodes = new Map();
  const edges = new Map();
  events.filter(isTransformation).forEach((event) => addCandidateSkills({ event, experiments, nodes, edges }));
  return {
    schema: 'genos.gvx.competence-graph/v1',
    scope: { organizationId: scope.organizationId, projectId: scope.projectId, entityId: scope.entityId },
    nodes: [...nodes.values()].sort(bySkillId),
    edges: [...edges.values()].sort(byEdge),
    sourceEventIds: events.map((event) => event.id)
  };
}

function completedExperiments(events) {
  return new Map(events.filter((event) => event.type === 'experiment_finished')
    .filter((event) => event.payload.assessment?.status === 'ready_for_independent_review')
    .map((event) => [event.payload.plan?.experimentId, event.id]).filter(([id]) => id));
}

function isTransformation(event) {
  return event.type === 'transformation_proposed' && event.payload.candidate;
}

function addCandidateSkills(input) {
  const { event, experiments, nodes, edges } = input;
  const candidate = event.payload.candidate;
  const evidenceIds = candidate.sourceExperienceIds.filter((id) => experiments.has(id));
  const skillDelta = candidate.skillDelta || {};
  (skillDelta.adds || []).filter(validSkillId).forEach((skillId) => {
    addSkill(nodes, skillId, evidenceIds.map((id) => experiments.get(id)));
    (skillDelta.requires || []).filter(validSkillId).forEach((requiredId) => {
      addSkill(nodes, requiredId, []);
      const key = `${requiredId}->${skillId}`;
      edges.set(key, { from: requiredId, to: skillId, relation: 'prerequisite' });
    });
  });
}

function addSkill(nodes, skillId, evidenceEventIds) {
  const current = nodes.get(skillId) || { skillId, epistemicStatus: 'unknown', evidenceEventIds: [] };
  current.evidenceEventIds = [...new Set([...current.evidenceEventIds, ...evidenceEventIds])].sort();
  if (current.evidenceEventIds.length) current.epistemicStatus = SUPPORTED;
  nodes.set(skillId, current);
}

function validSkillId(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(value); }
function bySkillId(left, right) { return left.skillId.localeCompare(right.skillId); }
function byEdge(left, right) { return `${left.from}->${left.to}`.localeCompare(`${right.from}->${right.to}`); }

module.exports = { buildCompetenceGraph };
