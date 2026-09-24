'use strict';

const runtime = require('../aTeamRuntime');
const teamRunStore = require('../teamRunStore');
const graphStore = require('../workGraph/workGraphStore');
const { compileWorkGraph } = require('../workGraph/workGraphCompiler');
const { analyzeDependencies } = require('../workGraph/dependencyAnalyzer');
const { executeRepair } = require('./repairExecutionService');

async function coordinateRepair(input = {}) {
  validateAdapters(input);
  const execution = await executeRepair({ ...input, deferResume: true });
  if (execution.receipt.status !== 'COMPLETED' || execution.run.status === 'BLOCKED') return execution.run;
  if (execution.run.status === 'RUNNING' && execution.replayed) return execution.run;
  try {
    const graph = await recompile(input.db, execution.run);
    const current = await persistProjection(input, execution.run, graph);
    const evidence = await invalidate({ input, run: current, change: graph, receipt: execution.receipt });
    const resumed = await resume({ input, run: current, change: graph, evidence, receipt: execution.receipt });
    return finalize({ input, run: current, resumed, evidence, receipt: execution.receipt });
  } catch (error) {
    return blockDeferredRepair({ input, teamRunId: execution.run.teamRunId, repairId: input.repairId, error });
  }
}

function validateAdapters(input) {
  for (const name of ['invalidateEvidence', 'resumeAffectedBranch']) {
    if (typeof input[name] !== 'function') throw coded(`Repair coordinator requires ${name}.`, 'ATEAM_REPAIR_COORDINATOR_ADAPTER_REQUIRED');
  }
}

async function recompile(db, run) {
  const previous = await graphStore.load(db, run.workGraphId);
  if (!previous) throw coded('Repair cannot proceed without the persisted WorkGraph.', 'ATEAM_REPAIR_GRAPH_MISSING');
  const graph = compileWorkGraph({ workGraphId: run.workGraphId, teamRunId: run.teamRunId, members: run.members });
  const affectedNodeIds = affectedNodes(previous, graph);
  preserveGraphProgress(previous, graph, affectedNodeIds);
  const saved = await graphStore.update({ db, workGraphId: previous.workGraphId, revision: previous.revision, graph });
  return { graph: saved, affectedNodeIds, previousRevision: previous.revision };
}

function affectedNodes(previous, next) {
  const before = new Map(previous.nodes.map((node) => [node.nodeId, node]));
  const after = new Map(next.nodes.map((node) => [node.nodeId, node]));
  const seeds = new Set();
  for (const node of next.nodes) {
    const old = before.get(node.nodeId);
    if (!old || old.ownerAgentId !== node.ownerAgentId || old.responsibility !== node.responsibility) seeds.add(node.nodeId);
  }
  for (const node of previous.nodes) if (!after.has(node.nodeId)) seeds.add(node.nodeId);
  return downstreamClosure(seeds, [...previous.edges, ...next.edges]).filter((id) => after.has(id));
}

function downstreamClosure(seeds, edges) {
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.fromNode)) outgoing.set(edge.fromNode, []);
    outgoing.get(edge.fromNode).push(edge.toNode);
  }
  const reached = new Set(seeds);
  const pending = [...seeds];
  while (pending.length) {
    for (const target of outgoing.get(pending.pop()) || []) {
      if (reached.has(target)) continue;
      reached.add(target);
      pending.push(target);
    }
  }
  return [...reached];
}

function preserveGraphProgress(previous, next, affectedNodeIds) {
  const affected = new Set(affectedNodeIds);
  const oldStatuses = new Map(previous.nodes.map((node) => [node.nodeId, node.status]));
  const analysis = analyzeDependencies(next);
  const computed = new Map();
  for (const layer of analysis.layers) {
    for (const nodeId of layer) computed.set(nodeId, nodeStatus({ nodeId, affected, oldStatuses, computed, analysis }));
  }
  next.nodes = next.nodes.map((node) => ({ ...node, status: computed.get(node.nodeId) }));
}

function nodeStatus({ nodeId, affected, oldStatuses, computed, analysis }) {
  if (!affected.has(nodeId) && oldStatuses.has(nodeId)) return oldStatuses.get(nodeId);
  const inbound = analysis.inbound.get(nodeId) || [];
  const ready = inbound.every((id) => computed.get(id) === 'COMPLETED');
  return ready ? 'READY' : 'BLOCKED';
}

async function persistProjection(input, run, change) {
  const members = run.members.map((member) => ({
    ...member, pipelineStage: change.graph.memberStages[member.memberId] || 0
  }));
  return runtime.transitionRun({
    db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { members, execution: patchReceipt(run.execution, input.repairId, { graphRevision: change.graph.revision, affectedNodeIds: change.affectedNodeIds }) }
  });
}

async function invalidate({ input, run, change, receipt }) {
  const result = await input.invalidateEvidence({ teamRunId: run.teamRunId, repairId: receipt.repairId, affectedNodeIds: change.affectedNodeIds, graphRevision: change.graph.revision });
  if (result?.accepted !== true) throw coded('Evidence invalidation was not confirmed.', 'ATEAM_REPAIR_EVIDENCE_INVALIDATION_FAILED');
  return { ...result, graph: change.graph, affectedNodeIds: change.affectedNodeIds };
}

async function resume({ input, run, change, evidence, receipt }) {
  const result = await input.resumeAffectedBranch({
    teamRunId: run.teamRunId, repairId: receipt.repairId, graph: change.graph,
    affectedNodeIds: change.affectedNodeIds, invalidatedEvidenceIds: evidence.invalidatedEvidenceIds || []
  });
  if (result?.accepted !== true) throw coded('Affected branch resumption was not confirmed.', 'ATEAM_REPAIR_RESUME_FAILED');
  return { ...result, affectedNodeIds: change.affectedNodeIds };
}

async function finalize({ input, run, resumed, evidence, receipt }) {
  const latest = await teamRunStore.load(input.db, run.teamRunId);
  if (latest.status !== 'REPAIRING') throw coded('A-Team run left repair state before resumption completed.', 'ATEAM_REPAIR_STATE_CONFLICT');
  const execution = patchReceipt(latest.execution, receipt.repairId, {
    status: 'COMPLETED', evidenceInvalidated: true, resumedNodeIds: resumed.affectedNodeIds,
    completedAt: new Date().toISOString()
  });
  return runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: latest.revision, patch: { status: 'RUNNING', execution } });
}

async function blockDeferredRepair({ input, teamRunId, repairId, error }) {
  const run = await teamRunStore.load(input.db, teamRunId);
  if (!run || run.status !== 'REPAIRING') throw error;
  const execution = patchReceipt(run.execution, repairId, { status: 'BLOCKED', errorCode: error.code || 'ATEAM_REPAIR_COORDINATION_FAILED', completedAt: new Date().toISOString() });
  const saved = await runtime.transitionRun({ db: input.db, teamRunId, revision: run.revision, patch: { status: 'BLOCKED', execution } });
  return { run: saved, receipt: findReceipt(saved, repairId), replayed: false };
}

function patchReceipt(execution, repairId, patch) {
  return { ...(execution || {}), repairReceipts: (execution?.repairReceipts || []).map((entry) => entry.repairId === repairId ? { ...entry, ...patch } : entry) };
}

function findReceipt(run, repairId) {
  return (run.execution?.repairReceipts || []).find((entry) => entry.repairId === repairId) || null;
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { coordinateRepair, recompile, affectedNodes, downstreamClosure };
