'use strict';

const graphStore = require('../workGraph/workGraphStore');
const { validateMemberEvidence, runtimeCoverage, missingCriteria } = require('./teamEvidenceService');
const { workerStatuses, TERMINAL } = require('./dependencyExecutionService');
const { telemetryDossier } = require('../../aTeamHandoffEvidenceService');
const { observeAteamIntegration } = require('../../aTeamIntegrationObserver');
const { evaluateQualityGate } = require('../../aTeamQualityGateService');

async function observeExecution(input) {
  const graph = await graphStore.load(input.db, input.run.workGraphId);
  if (!graph || graph.teamRunId !== input.run.teamRunId) throw coded('Canonical WorkGraph is missing.', 'ATEAM_RUN_GRAPH_MISSING');
  const statuses = await workerStatuses(input.db, input.plan.members);
  const dossiers = await Promise.all(input.plan.members.map((member) => telemetryDossier(input.db, member.workerId)));
  const verdicts = new Map(input.plan.members.map((member, index) => [member.workerId, validateMemberEvidence(member, dossiers[index])]));
  const workers = input.plan.members.map((member) => ({ ...member, agentId: member.workerId }));
  const observation = observeAteamIntegration({ members: workers, workers, dossiers });
  rejectIntegrationViolations(verdicts, observation);
  const updated = projectGraph({ ...input, graph, statuses, verdicts, dossiers });
  const saved = JSON.stringify(updated) === JSON.stringify(graph) ? graph
    : await graphStore.update({ db: input.db, workGraphId: graph.workGraphId, revision: graph.revision, graph: updated });
  const coverage = runtimeCoverage({ ...input, graph: saved, statuses, verdicts });
  const gate = evaluateQualityGate({ capabilityCoverage: coverage }, observation.observerReport);
  enforceMissionCriteria(input.run, verdicts, gate);
  const promoted = saved.status === 'SUCCEEDED';
  const terminal = input.expired || input.plan.members.every((member) => TERMINAL.has(statuses.get(member.workerId)));
  return { graph: saved, statuses, dossiers, verdicts, coverage, observation, gate, terminal, promoted };
}

function rejectIntegrationViolations(verdicts, observation) {
  for (const failure of [...observation.failures, ...observation.integrationFailures]) {
    const verdict = verdicts.get(failure.workerId);
    if (verdict) Object.assign(verdict, { promoted: false, reason: failure.code, details: [failure.message] });
  }
}

function enforceMissionCriteria(run, verdicts, gate) {
  const verified = [...verdicts.values()].filter((verdict) => verdict.promoted);
  const evaluations = verified.flatMap((verdict) => verdict.report.acceptanceEvaluations || []);
  const refs = verified.flatMap((verdict) => verdict.evidenceRefs);
  const missing = missingCriteria(run.successCriteria, evaluations, refs);
  gate.missingMissionCriteria = missing;
  if (missing.length) {
    gate.passed = false;
    gate.reasons.push('Mission acceptance criteria remain unverified: ' + missing.join(', '));
  }
}

function projectGraph(input) {
  const graph = structuredClone(input.graph);
  require('./handoffReceiptService').projectHandoffReceipts(graph, input);
  const byNode = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const members = new Map(input.plan.members.map((member) => [member.memberId, member]));
  for (const layer of graph.layers) {
    for (const nodeId of layer) {
      const node = byNode.get(nodeId);
      const member = members.get(node.memberId);
      const dependencies = graph.edges.filter((edge) => edge.toNode === nodeId && edge.blocking !== false);
      const missing = dependencies.filter((edge) => byNode.get(edge.fromNode).status !== 'SUCCEEDED' || edge.available !== true);
      updateNode(node, { ...input, member, missing });
    }
  }
  require('./handoffReceiptService').projectHandoffReceipts(graph, input);
  graph.status = graph.nodes.every((node) => node.status === 'SUCCEEDED') && graph.edges.filter((edge) => edge.blocking !== false).every((edge) => edge.accepted) ? 'SUCCEEDED' : 'RUNNING';
  return graph;
}

function updateNode(node, input) {
  const member = input.member;
  if (!member) return setBlocked(node, 'owner_missing');
  node.ownerAgentId = member.workerId;
  if (input.missing.length) return setBlocked(node, 'dependency_not_promoted', input.missing.map((edge) => edge.fromNode));
  const status = input.statuses.get(member.workerId);
  const verdict = input.verdicts.get(member.workerId);
  delete node.blockedReason;
  node.evidenceRefs = [];
  if (status === 'completed') return applyVerdict(node, verdict);
  if (['timed_out', 'timeout'].includes(status) || input.expired) { node.status = 'TIMED_OUT'; return; }
  if (TERMINAL.has(status)) { node.status = 'FAILED'; return; }
  node.status = status === 'missing' || status === 'idle' ? 'READY' : 'RUNNING';
}

function applyVerdict(node, verdict) {
  if (!verdict.promoted) return setBlocked(node, verdict.reason, verdict.details);
  node.status = 'SUCCEEDED';
  node.evidenceRefs = verdict.evidenceRefs;
}

function setBlocked(node, code, dependencies = []) {
  node.status = 'BLOCKED';
  node.evidenceRefs = [];
  node.blockedReason = { code, dependencies };
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { observeExecution, projectGraph };
