'use strict';

const { listEvents } = require('./gvxDevelopmentLedger');

const SUPPORTED = 'empirically_supported';
const HASH = /^[a-f0-9]{64}$/;

async function buildCompetenceGraph(db, scope) {
  const events = await listEvents(db, scope);
  const experiments = completedExperiments(events);
  const nodes = new Map();
  const edges = new Map();
  events.filter(isTransformation).forEach((event) => addCandidateSkills({ event, experiments, nodes, edges }));
  return { schema: 'genos.gvx.competence-graph/v1',
    scope: { organizationId: scope.organizationId, projectId: scope.projectId, entityId: scope.entityId },
    nodes: [...nodes.values()].sort(bySkillId), edges: [...edges.values()].sort(byEdge),
    sourceEventIds: events.map((event) => event.id) };
}

function completedExperiments(events) {
  return new Map(events.filter((event) => event.type === 'experiment_finished')
    .filter((event) => event.payload.assessment?.status === 'ready_for_independent_review')
    .map((event) => [event.payload.plan?.experimentId, { eventId: event.id, event }]).filter(([id]) => id));
}

function skillClaim(experiment, skillId) {
  const outcomes = experiment.payload.outcomes || [];
  for (const outcome of outcomes) {
    const claim = (outcome.competenceEvidence || []).find((item) => validSkillClaim(item,
      skillId, outcome.evidence || []));
    if (claim) return claim;
  }
  return null;
}

function validSkillClaim(claim, skillId, evidence) {
  if (claim?.claim !== skillId || typeof claim.measure !== 'string' || !claim.measure.trim()) return false;
  if (!Number.isFinite(claim.baseline) || !Number.isFinite(claim.candidate)) return false;
  if (!improved(claim)) return false;
  if (!Array.isArray(claim.verifierRefs) || !claim.verifierRefs.length) return false;
  const refs = new Set(evidence.filter(validEvidence).map((item) => item.artifactHash));
  return claim.verifierRefs.every((ref) => HASH.test(ref) && refs.has(ref));
}

function improved(claim) {
  if (claim.direction === 'higher') return claim.candidate > claim.baseline;
  if (claim.direction === 'lower') return claim.candidate < claim.baseline;
  return false;
}

function validEvidence(item) {
  return typeof item?.verifierId === 'string' && Boolean(item.verifierId.trim()) && HASH.test(item.artifactHash || '');
}

function addCandidateSkills(input) {
  const { event, experiments, nodes, edges } = input;
  const candidate = event.payload.candidate;
  const experimentIds = candidate.sourceExperienceIds.filter((id) => experiments.has(id));
  const skillDelta = candidate.skillDelta || {};
  (skillDelta.adds || []).filter(validSkillId).forEach((skillId) => {
    const supported = experimentIds.map((id) => ({ id, experiment: experiments.get(id) }))
      .map((entry) => ({ ...entry, claim: skillClaim(entry.experiment.event, skillId) }))
      .filter((entry) => entry.claim);
    addSkill({ nodes, skillId, evidenceEventIds: supported.map((entry) => entry.experiment.eventId),
      claims: supported.map((entry) => entry.claim) });
    addPrerequisites({ requires: skillDelta.requires, skillId, nodes, edges });
  });
}

function addPrerequisites(options) {
  const { requires, skillId, nodes, edges } = options;
  (requires || []).filter(validSkillId).forEach((requiredId) => {
    addSkill({ nodes, skillId: requiredId, evidenceEventIds: [] });
    edges.set(`${requiredId}->${skillId}`, { from: requiredId, to: skillId, relation: 'prerequisite' });
  });
}

function addSkill(options) {
  const { nodes, skillId, evidenceEventIds, claims = [] } = options;
  const current = nodes.get(skillId) || { skillId, epistemicStatus: 'unknown', evidenceEventIds: [], claims: [] };
  current.evidenceEventIds = [...new Set([...current.evidenceEventIds, ...evidenceEventIds])].sort();
  current.claims = uniqueClaims([...current.claims, ...claims]);
  if (current.evidenceEventIds.length) current.epistemicStatus = SUPPORTED;
  nodes.set(skillId, current);
}

function uniqueClaims(claims) {
  return claims.filter((claim, index) => claims.findIndex((item) => item.claim === claim.claim
    && item.measure === claim.measure) === index);
}

function isTransformation(event) { return event.type === 'transformation_proposed' && event.payload.candidate; }
function validSkillId(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(value); }
function bySkillId(left, right) { return left.skillId.localeCompare(right.skillId); }
function byEdge(left, right) { return `${left.from}->${left.to}`.localeCompare(`${right.from}->${right.to}`); }

module.exports = { buildCompetenceGraph, validSkillClaim };
