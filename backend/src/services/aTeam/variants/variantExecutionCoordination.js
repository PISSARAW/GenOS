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

function relayMemberId(member) {
  return member?.memberId || member?.agentId || member?.workerId;
}

function relayHops(mission, members) {
  if (members.length === 2 && mission.relayHandoffs === undefined) {
    return [{ mission, members }];
  }
  const entries = mission.relayHandoffs;
  if (!Array.isArray(entries) || entries.length !== members.length - 1) {
    throw coded('Relay chain requires one explicit handoff per adjacent member pair.',
      'ATEAM_RELAY_CHAIN_INCOMPLETE');
  }
  return entries.map((entry, index) => {
    const pair = members.slice(index, index + 2);
    if (entry?.previousOwner !== relayMemberId(pair[0])
      || entry?.nextOwner !== relayMemberId(pair[1])
      || entry?.handoffSequence !== index + 1) {
      throw coded('Relay handoffs must follow the member order and sequence.',
        'ATEAM_RELAY_CHAIN_INVALID');
    }
    return { mission: entry, members: pair };
  });
}

function executeRelayHop(runtime, hop, previousDigest) {
  if (previousDigest && hop.mission.handoffState?.previousHandoffDigest !== previousDigest) {
    throw coded('Relay handoff must reference the previous accepted digest.',
      'ATEAM_RELAY_CHAIN_LINK_INVALID');
  }
  const policy = relayTeamFullPotential(hop.mission, hop.members);
  runtime.recordEvidence('relay_policy', policy);
  const handoff = policy.cryptographic_versioned_handoff;
  runtime.recordEvidence('handoff_created', {
    version: handoff.version, sequence: handoff.sequence, digest: handoff.digest,
    previousOwner: handoff.payload.previousOwner, nextOwner: handoff.payload.nextOwner
  });
  const ack = hop.mission.handoffAcknowledgment;
  if (!ack) throw coded('Relay handoff requires acknowledgment', 'ATEAM_RELAY_ACK_MISSING');
  const acknowledged = acknowledgeRelay({ ...handoff.payload, digest: ack.digest,
    receiverId: ack.receiverId, accepted: ack.accepted, reason: ack.reason });
  runtime.recordDecision('relay_handoff', acknowledged);
  if (acknowledged.status !== 'ACCEPTED') {
    runtime.recordEvidence('handoff_rolled_back', {
      ownerId: acknowledged.ownerId, reason: acknowledged.reason
    });
    throw coded(`Relay handoff rolled back: ${acknowledged.reason}`, 'ATEAM_RELAY_ROLLED_BACK');
  }
  runtime.recordEvidence('ownership_lease', policy.state_ownership_lease);
  return { handoff: acknowledged, lease: policy.state_ownership_lease };
}

module.exports = {
  async executeMultiteam() {
    this.recordStep('multiteam_start', {});

    const multiPolicy = multiteamPolicy(this.mission, this.members);
    this.recordEvidence('multiteam_policy', multiPolicy);

    const teamConfigs = multiPolicy.multiteamSystem.teamOfTeams;
    this.recordEvidence('sub_teams', { count: teamConfigs.length, teams: teamConfigs.map(t => t.teamId) });

    for (const team of teamConfigs) {
      this.recordEvidence('sub_team_planned', { teamId: team.teamId, variant: team.variant, members: team.members.length });
    }

    const contracts = multiPolicy.interTeamContracts;
    for (const contract of contracts) {
      this.recordEvidence('inter_team_contract', { from: contract.from, to: contract.to, validated: contract.validated });
    }

    const council = multiPolicy.integrationCouncil;
    this.recordEvidence('integration_council', { members: council.members, chair: council.chair, authority: council.authority });

    const conflicts = this.mission.conflicts || [];
    for (const conflict of conflicts) {
      this.recordDecision('conflict_resolution_plan', { conflict, resolution: multiPolicy.systemicConflictDetection.resolution });
    }

    if (!this.db || typeof this.mission.executeTeam !== 'function') {
      throw coded('Multiteam execution requires persistence and a verified child TeamRun executor.',
        'ATEAM_MTS_EXECUTOR_REQUIRED');
    }
    const program = require('../multiteam/programRuntimeService');
    const programId = this.mission.programId || `${this.orchestratorId}:multiteam`;
    await program.createProgramRun({ db: this.db, programId,
      parentTeamRunId: this.mission.parentTeamRunId, teams: this.mission.teams,
      contracts: this.mission.interTeamContracts, council,
      systemObjective: this.mission.systemObjectives?.[0] || this.mission.goal,
      globalBudget: this.mission.globalBudget || multiPolicy.budget?.global });
    const executed = await program.advanceProgramRun({ db: this.db, programId,
      orchestratorId: this.orchestratorId, executeTeam: this.mission.executeTeam });
    this.state.result = { teams: teamConfigs, contracts, council,
      budget: multiPolicy.budget, program: executed };
    this.state.status = executed.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
    if (this.state.status !== 'SUCCEEDED') {
      throw coded(`Multiteam program ended as ${executed.status}.`, 'ATEAM_MTS_INCOMPLETE');
    }
    return this.state;
  },

  async executeAdaptive() {
    this.recordStep('adaptive_start', {});

    const adaptivePolicy = adaptiveTeamFullPotential(this.mission, this.members);
    this.recordEvidence('adaptive_policy', adaptivePolicy);

    const gaps = adaptivePolicy.continuous_staffing_by_capability_gap.gaps;
    this.recordEvidence('capability_gaps', { gaps });

    const proposals = this.mission.staffingProposals || [];
    for (const proposal of proposals) {
      const result = authorizeStaffingChange({
        proposal,
        history: this.mission.staffingHistory || [],
        policy: {
          hysteresisThreshold: adaptivePolicy.hysteresis_anti_thrashing.hysteresisThreshold,
          minStabilityPeriod: adaptivePolicy.hysteresis_anti_thrashing.minStabilityPeriod,
          maxReconfigurationsPerHour: adaptivePolicy.hysteresis_anti_thrashing.maxReconfigPerHour,
          stableSince: adaptivePolicy.hysteresis_anti_thrashing.stableSince
        },
        availableBudget: this.mission.availableBudget
      });

      this.recordDecision('staffing_change', { proposal, approved: result.approved, reason: result.reason });

      if (!result.approved) {
        throw coded(`Staffing change rejected: ${result.reason}`, 'ATEAM_STAFFING_REJECTED');
      }
    }

    const memoryTransfer = adaptivePolicy.memory_transfer;
    this.recordEvidence('memory_transfer', { artifacts: memoryTransfer.artifacts, verification: memoryTransfer.verificationMethod });

    this.state.result = { gaps, staffingChanges: proposals, memoryTransfer };
    return this.state;
  },

  async executeRelayTeam() {
    this.recordStep('relay_team_start', {});
    const completed = [];
    for (const hop of relayHops(this.mission, this.members)) {
      const previousDigest = completed.at(-1)?.handoff.digest;
      completed.push(executeRelayHop(this, hop, previousDigest));
    }
    const last = completed.at(-1);
    this.state.result = { handoff: last.handoff, handoffs: completed.map((entry) => entry.handoff),
      lease: last.lease, finalOwnerId: last.handoff.ownerId };
    return this.state;
  }
};
