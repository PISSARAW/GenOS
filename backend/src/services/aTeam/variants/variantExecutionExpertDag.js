'use strict';

const {
  evaluateConsensus,
  resolveMatrixDecision,
  createRelayHandoff,
  acknowledgeRelay,
  advanceIncidentPeriod,
  authorizeUrgentAction,
  authorizeStaffingChange,
  evaluateJoin,
  executePipeline,
  validateSchema,
  validateArtifact,
  canonicalJson
} = require('./variantExecutionService');

const { expertCommitteeFullPotential } = require('./expertCommitteePolicy');
const { pipelinePolicy } = require('./stageVariantPolicy');
const { projectDagPolicy } = require('./projectDagPolicy');
const { crossFunctionalPodFullPotential } = require('./crossFunctionalPodPolicy');
const { boundarySpannerFullPotential } = require('./boundarySpannerPolicy');
const { matrixTeamFullPotential } = require('./matrixTeamPolicy');
const { tigerTeamFullPotential } = require('./tigerTeamPolicy');
const { incidentCommandFullPotential } = require('./incidentCommandPolicy');
const { multiteamPolicy } = require('./multiteamVariantPolicy');
const { adaptiveTeamFullPotential } = require('./adaptiveTeamPolicy');
const { relayTeamFullPotential } = require('./relayTeamPolicy');

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = {
  async executeExpertCommittee() {
    this.recordStep('expert_committee_start', {});

    const expertiseMatrix = this.members.map(member => ({
      memberId: member.memberId || member.agentId || member.workerId,
      expertise: [...new Set(member.expertise || member.capabilities || [])],
      verifiedCapabilities: member.verifiedCapabilities || [],
      confidenceLevel: Number.isFinite(member.confidenceLevel) ? member.confidenceLevel : null
    }));

    const policy = this.mission.consensusProtocol || {
      quorum: Math.ceil(this.members.length * 2 / 3),
      dissentRequired: true,
      rounds: 2,
      tieBreak: 'evidence_review'
    };

    if (policy.quorum < 1 || policy.quorum > this.members.length) {
      throw coded('Expert committee quorum is outside team size.', 'ATEAM_CONSENSUS_QUORUM_INVALID');
    }

    this.recordEvidence('expertise_matrix', { matrix: expertiseMatrix });
    this.recordEvidence('consensus_protocol', { protocol: policy });

    const ballots = this.mission.ballots || [];
    const validBallots = ballots.filter(b => b.memberId && b.decision && Array.isArray(b.evidenceRefs) && b.evidenceRefs.length > 0);

    this.recordEvidence('ballots_received', { total: ballots.length, valid: validBallots.length });

    const consensus = evaluateConsensus({ protocol: policy, ballots: validBallots });
    this.recordDecision('consensus', consensus);

    if (consensus.status !== 'CONSENSUS') {
      this.recordEvidence('consensus_failed', { reason: 'NO_CONSENSUS', dissent: consensus.dissent });
      throw coded('No consensus reached', 'ATEAM_NO_CONSENSUS');
    }

    this.recordEvidence('consensus_achieved', {
      decision: consensus.decision,
      quorum: consensus.quorum,
      participation: consensus.participation,
      dissentCount: consensus.dissent.length,
      evidenceRefs: consensus.evidenceRefs
    });

    this.state.result = { consensus: consensus.decision, evidenceRefs: consensus.evidenceRefs, dissent: consensus.dissent };
    return this.state;
  },

  async executePipeline() {
    this.recordStep('pipeline_start', {});

    const stages = this.mission.stages || this.members.map((m, i) => ({
      stageId: `stage_${i + 1}`,
      memberId: m.memberId || m.agentId || m.workerId,
      name: m.stageName || `Stage ${i + 1}`,
      inputSchema: m.inputSchema || { type: 'object' },
      outputSchema: m.outputSchema || { type: 'object' },
      run: m.run
    }));

    this.recordEvidence('stage_contracts', { stages: stages.map(s => ({ stageId: s.stageId, inputSchema: s.inputSchema, outputSchema: s.outputSchema })) });

    const cache = new Map();
    const resumeState = this.mission.resumeState || {};

    const result = await executePipeline({
      input: this.mission.input,
      stages,
      cache,
      resumeState,
      maxRetries: this.mission.maxRetries,
      backoffMs: this.mission.retryBackoffMs,
      executionModel: this.mission.executionModel
    });

    this.recordEvidence('pipeline_stages', { stages: result.stages });

    if (result.status !== 'SUCCEEDED') {
      this.recordEvidence('pipeline_failed', { failedStage: result.failedStage, code: result.code });
      throw coded(`Pipeline failed at ${result.failedStage}`, result.code);
    }

    this.recordEvidence('pipeline_succeeded', { value: result.value, cacheKeys: Array.from(cache.keys()) });
    this.state.result = { value: result.value, stages: result.stages, resumeState: result.resumeState };
    return this.state;
  },

  async executeProjectDag() {
    this.recordStep('project_dag_start', {});

    const dagPolicy = projectDagPolicy(this.mission, this.members);
    this.recordEvidence('dag_policy', dagPolicy);

    const { dagNodes, dagEdges, executionModel } = dagPolicy;
    const nodesById = new Map(dagNodes.map(n => [n.nodeId, n]));
    const topologicalOrder = this.topologicalSort(dagNodes, dagEdges);

    const statuses = {};
    const outputs = {};

    for (const nodeId of topologicalOrder) {
      const node = nodesById.get(nodeId);
      const joinConfig = executionModel.conditionalJoins?.find(j => j.nodeId === nodeId);

      if (joinConfig) {
        const joinResult = evaluateJoin({ join: joinConfig, statuses });
        if (!joinResult.ready) {
          if (joinResult.terminal) {
            throw coded(`DAG join failed for ${nodeId}: ${joinResult.reason}`, 'ATEAM_DAG_JOIN_FAILED');
          }
          continue;
        }
      }

      const inputArtifacts = node.dependencies.map(depId => outputs[depId]).filter(Boolean);
      const input = inputArtifacts.length === 1 ? inputArtifacts[0] : Object.assign({}, ...inputArtifacts);

      if (node.inputSchema) {
        const errors = validateArtifact(input, node.inputSchema);
        if (errors.length) {
          throw coded(`DAG node ${nodeId} input validation failed: ${errors.join(', ')}`, 'ATEAM_DAG_INPUT_INVALID');
        }
      }

      this.recordStep('dag_node_start', { nodeId, input });

      if (!node.run) {
        throw coded(`DAG node ${nodeId} has no run function`, 'ATEAM_DAG_NODE_MISSING_RUN');
      }

      const output = await node.run(input);

      if (node.outputSchema) {
        const errors = validateArtifact(output, node.outputSchema);
        if (errors.length) {
          throw coded(`DAG node ${nodeId} output validation failed: ${errors.join(', ')}`, 'ATEAM_DAG_OUTPUT_INVALID');
        }
      }

      outputs[nodeId] = output;
      statuses[nodeId] = 'SUCCEEDED';

      this.recordEvidence('dag_node_completed', { nodeId, output });
      this.recordHandoff('dag_data_flow', { from: nodeId, to: dagEdges.filter(e => e.from === nodeId).map(e => e.to) });
    }

    const criticalPathOutputs = dagPolicy.executionModel.criticalPathScheduler.path
      .filter(id => outputs[id])
      .reduce((acc, id) => ({ ...acc, [id]: outputs[id] }), {});

    this.state.result = { outputs, criticalPathOutputs, statuses };
    return this.state;
  },

  topologicalSort(nodes, edges) {
    const inDegree = new Map(nodes.map(n => [n.nodeId, 0]));
    const adj = new Map(nodes.map(n => [n.nodeId, []]));
    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      adj.get(edge.from).push(edge.to);
    }
    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const result = [];
    while (queue.length) {
      const u = queue.shift();
      result.push(u);
      for (const v of adj.get(u)) {
        const d = inDegree.get(v) - 1;
        inDegree.set(v, d);
        if (d === 0) queue.push(v);
      }
    }
    if (result.length !== nodes.length) throw coded('DAG has cycle', 'ATEAM_DAG_CYCLE');
    return result;
  }


};
