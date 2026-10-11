'use strict';

const runStore = require('../teamRunStore');
const graphStore = require('../workGraph/workGraphStore');
const { canonicalJson } = require('../variants/variantExecutionHelpers');

async function inspectCompletion(input) {
  const child = await runStore.load(input.db, input.childRunId);
  const graph = child?.workGraphId && await graphStore.load(input.db, child.workGraphId);
  if (!validChild(child, graph, input)) throw proofRequired();
  return { status: 'WAITING', childRunId: child.teamRunId,
    childExecutionObserved: true, reason: 'authoritative_program_attestation_unavailable',
    evidenceRefs: [...new Set(graph.nodes.flatMap((node) => node.evidenceRefs))] };
}

function validChild(child, graph, input) {
  if (!child || !validBinding(child, input) || !validClosure(child)) return false;
  const members = new Set(input.team.definition.members.map((member) => member.memberId));
  return child.members.length === members.size
    && child.members.every((member) => members.has(member.memberId)) && validGraph(graph, child);
}

function validBinding(child, input) {
  const binding = child?.execution?.programBinding;
  const expected = { programId: input.program.programId, teamId: input.team.teamId,
    parentTeamRunId: input.program.parentTeamRunId, parentMissionId: input.parentMissionId,
    authorizedBy: input.orchestratorId, budget: input.team.budget };
  return child?.teamRunId === input.childRunId && child.missionId === input.parentMissionId
    && canonicalJson(binding) === canonicalJson(expected);
}

function validClosure(child) {
  return child.status === 'COMPLETED' && child.phase === 'DEBRIEF'
    && child.execution.integration?.accepted === true && child.execution.integration.gate?.passed === true;
}

function validGraph(graph, child) {
  return graph?.teamRunId === child.teamRunId && graph.status === 'SUCCEEDED'
    && graph.nodes.length > 0 && graph.nodes.every((node) => node.status === 'SUCCEEDED'
      && Array.isArray(node.evidenceRefs) && node.evidenceRefs.some(nonEmpty))
    && graph.edges.every((edge) => edge.blocking === false || edge.accepted === true);
}

function nonEmpty(value) { return typeof value === 'string' && Boolean(value.trim()); }
function proofRequired() {
  return Object.assign(new Error('Subteam completion requires persisted execution evidence.'),
    { code: 'ATEAM_MTS_SUBRUN_PROOF_REQUIRED' });
}

module.exports = { inspectCompletion };
