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
  async executeMultiteam() {
    this.recordStep('multiteam_start', {});

    const multiPolicy = multiteamPolicy(this.mission, this.members);
    this.recordEvidence('multiteam_policy', multiPolicy);

    const teamConfigs = multiPolicy.multiteamSystem.teamOfTeams;
    this.recordEvidence('sub_teams', { count: teamConfigs.length, teams: teamConfigs.map(t => t.teamId) });

    for (const team of teamConfigs) {
      this.recordEvidence('sub_team_launched', { teamId: team.teamId, variant: team.variant, members: team.members.length });
    }

    const contracts = multiPolicy.interTeamContracts;
    for (const contract of contracts) {
      this.recordEvidence('inter_team_contract', { from: contract.from, to: contract.to, validated: contract.validated });
    }

    const council = multiPolicy.integrationCouncil;
    this.recordEvidence('integration_council', { members: council.members, chair: council.chair, authority: council.authority });

    const conflicts = this.mission.conflicts || [];
    for (const conflict of conflicts) {
      this.recordDecision('conflict_resolution', { conflict, resolution: multiPolicy.systemicConflictDetection.resolution });
    }

    this.state.result = { teams: teamConfigs, contracts, council, budget: multiPolicy.budget };
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

    const relayPolicy = relayTeamFullPotential(this.mission, this.members);
    this.recordEvidence('relay_policy', relayPolicy);

    const handoff = relayPolicy.cryptographic_versioned_handoff;
    this.recordEvidence('handoff_created', {
      version: handoff.version,
      sequence: handoff.sequence,
      digest: handoff.digest,
      previousOwner: handoff.payload.previousOwner,
      nextOwner: handoff.payload.nextOwner
    });

    const ack = this.mission.handoffAcknowledgment;
    if (!ack) {
      throw coded('Relay handoff requires acknowledgment', 'ATEAM_RELAY_ACK_MISSING');
    }

    const acknowledged = acknowledgeRelay({
      ...handoff.payload,
      digest: ack.digest,
      receiverId: ack.receiverId,
      accepted: ack.accepted,
      reason: ack.reason
    });

    this.recordDecision('relay_handoff', acknowledged);

    if (acknowledged.status !== 'ACCEPTED') {
      this.recordEvidence('handoff_rolled_back', { ownerId: acknowledged.ownerId, reason: acknowledged.reason });
      throw coded(`Relay handoff rolled back: ${acknowledged.reason}`, 'ATEAM_RELAY_ROLLED_BACK');
    }

    this.recordEvidence('ownership_lease', relayPolicy.state_ownership_lease);
    this.state.result = { handoff: acknowledged, lease: relayPolicy.state_ownership_lease };
    return this.state;
  }
};
