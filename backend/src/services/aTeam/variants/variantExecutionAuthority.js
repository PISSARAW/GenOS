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
  async executeCrossFunctionalPod() {
    this.recordStep('cross_functional_pod_start', {});

    const podPolicy = crossFunctionalPodFullPotential(this.mission, this.members);
    this.recordEvidence('pod_policy', podPolicy);

    const owners = podPolicy.artifact_ownership.owners;
    this.recordEvidence('artifact_owners', { owners });

    for (const owner of owners) {
      this.recordEvidence('ownership_validation', { artifact: owner.artifact, owner: owner.owner, lifecycle: owner.lifecycle });
    }

    const externalDeps = podPolicy.limit_external_dependencies.dependencies;
    if (externalDeps.length > podPolicy.limit_external_dependencies.limit) {
      throw coded('Cross-functional pod exceeds external dependency limit', 'ATEAM_POD_EXTERNAL_DEPENDENCY_LIMIT');
    }

    this.recordEvidence('external_dependencies', { count: externalDeps.length, limit: podPolicy.limit_external_dependencies.limit });

    const autonomy = podPolicy.autonomy_metric;
    this.recordEvidence('autonomy_metric', autonomy);

    if (autonomy.score < autonomy.threshold) {
      this.recordEvidence('autonomy_warning', { score: autonomy.score, threshold: autonomy.threshold, trend: autonomy.trend });
    }

    this.state.result = { owners, externalDependencies: externalDeps, autonomyScore: autonomy.score };
    return this.state;
  },

  async executeBoundarySpanner() {
    this.recordStep('boundary_spanner_start', {});

    const boundaryPolicy = boundarySpannerFullPotential(this.mission, this.boundaries, this.members);
    this.recordEvidence('boundary_policy', boundaryPolicy);

    const contracts = boundaryPolicy.semantic_contract_models.contracts;
    const validated = contracts.filter((contract) => contract.status === 'validated');
    const proposals = contracts.filter((contract) => contract.status === 'proposal_required');
    this.recordEvidence('contracts_validated', { count: validated.length });
    this.recordEvidence('contract_proposals_required', {
      boundaries: proposals.map((contract) => contract.boundaryId),
      promotionBlocked: proposals.length > 0
    });

    for (const contract of validated) {
      this.recordEvidence('dual_validation', {
        boundaryId: contract.boundaryId,
        fromDomain: contract.fromDomain,
        toDomain: contract.toDomain,
        provenanceRequired: contract.provenanceRequired
      });

      this.recordEvidence('transformation_provenance', {
        boundaryId: contract.boundaryId,
        tracked: contract.transformationProvenance.enabled
      });
    }

    const driftDetection = boundaryPolicy.semantic_drift_detection;
    this.recordEvidence('drift_detection_config', driftDetection);

    this.state.result = { contracts, driftDetection, promotionBlocked: proposals.length > 0 };
    return this.state;
  },

  async executeMatrixTeam() {
    this.recordStep('matrix_team_start', {});

    const matrixPolicy = matrixTeamFullPotential(this.mission);
    this.recordEvidence('matrix_policy', matrixPolicy);

    const decisions = this.mission.decisions || [];
    for (const decision of decisions) {
      const raciEntry = matrixPolicy.raci_dimensions.raciMatrix[decision.type];
      if (!raciEntry) {
        throw coded(`No authority defined for decision type: ${decision.type}`, 'ATEAM_MATRIX_AUTHORITY_MISSING');
      }

      const authority = {
        decisionType: decision.type,
        functionalOwnerId: raciEntry.functionalOwner,
        productOwnerId: raciEntry.productOwner,
        escalationPath: raciEntry.escalationPath,
        currentRevision: raciEntry.currentRevision ?? 0
      };

      this.recordEvidence('decision_submitted', { decisionId: decision.decisionId, type: decision.type });

      const result = resolveMatrixDecision({
        authority,
        decision,
        currentRevision: authority.currentRevision
      });

      this.recordDecision('matrix_decision', result);

      if (result.status === 'DISAGREEMENT') {
        this.recordEvidence('disagreement', { resolution: result.resolution });
      }
    }

    this.state.result = { decisions: matrixPolicy.raci_dimensions.decisionLog };
    return this.state;
  },

  async executeTigerTeam() {
    this.recordStep('tiger_team_start', {});

    const tigerPolicy = tigerTeamFullPotential(this.mission);
    this.recordEvidence('tiger_policy', tigerPolicy);

    const mandate = tigerPolicy.emergency_scope;
    this.recordEvidence('mandate', { scope: mandate.scope, allowedActions: mandate.allowedActions, prohibitedActions: mandate.prohibitedActions });

    const actions = this.mission.actions || [];
    const sourceMandate = this.mission.urgentMandate || {};
    const actionMandate = {
      ...sourceMandate,
      hardTimebox: sourceMandate.hardTimebox || { enforceAt: tigerPolicy.hard_timebox.absoluteDeadline }
    };
    for (const action of actions) {
      const auth = authorizeUrgentAction({
        mandate: actionMandate,
        action,
        now: Date.now()
      });

      this.recordDecision('urgent_action', { action: action.type, authorized: auth.authorized, auditRequired: auth.auditRequired });

      if (!auth.authorized) {
        throw coded(`Action ${action.type} not authorized by mandate`, 'ATEAM_TIGER_ACTION_UNAUTHORIZED');
      }
    }

    const stopCriteria = tigerPolicy.stop_criteria;
    for (const criterion of stopCriteria) {
      this.recordEvidence('stop_criterion', { criterionId: criterion.criterionId, description: criterion.description, evaluated: criterion.evaluated });
    }

    this.state.result = { actions, stopCriteria, mandate: tigerPolicy.hard_timebox };
    return this.state;
  },

  async executeIncidentCommand() {
    this.recordStep('incident_command_start', {});

    const icsPolicy = incidentCommandFullPotential(this.mission, this.members);
    this.recordEvidence('ics_policy', icsPolicy);

    const roles = icsPolicy.mandatory_ics_roles.roles;
    this.recordEvidence('ics_roles', { roles, allAssigned: icsPolicy.mandatory_ics_roles.allAssigned });

    const events = this.mission.incidentEvents || [];
    let state = { status: 'ACTIVE', period: 1, timeline: [], latestSitrep: null };

    for (const event of events) {
      if (!this.allowedIncidentEvent(state.status, event.type)) {
        throw coded(`Invalid incident event ${event.type} for status ${state.status}`, 'ATEAM_ICS_TRANSITION_INVALID');
      }

      state = advanceIncidentPeriod({ state, event });
      this.recordEvidence('incident_event', { type: event.type, status: state.status, period: state.period });

      if (event.type === 'SITREP') {
        this.recordEvidence('sitrep', { payload: event.payload, period: state.period });
      }

      if (event.type === 'HANDOVER_ACCEPTED') {
        this.recordEvidence('handover_accepted', { newCommander: event.actorId, period: state.period });
      }
    }

    if (state.status !== 'CLOSED') {
      this.recordEvidence('incident_not_closed', { finalStatus: state.status });
    }

    this.state.result = { state, events };
    return this.state;
  },

  allowedIncidentEvent(status, type) {
    const INCIDENT_TRANSITIONS = { ACTIVE: ['SITREP', 'HANDOVER', 'CLOSE'], HANDOVER_PENDING: ['HANDOVER_ACCEPTED', 'CLOSE'], CLOSED: [] };
    return (INCIDENT_TRANSITIONS[status] || []).includes(type);
  }
};
