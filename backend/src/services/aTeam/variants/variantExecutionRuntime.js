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

class VariantExecutionRuntime {
  constructor(...args) {
    const context = args.length === 1 ? args[0] : { db: args[0], orchestratorId: args[1], plan: args[2], mission: args[3], members: args[4], boundaries: args[5] };
    const { db, orchestratorId, plan, mission, members, boundaries } = context;
    this.db = db;
    this.orchestratorId = orchestratorId;
    this.plan = plan;
    this.mission = mission;
    this.members = members;
    this.boundaries = boundaries;
    this.variant = plan.variant;
    this.evidence = [];
    this.decisions = [];
    this.handoffs = [];
    this.state = { status: 'STARTED', steps: [] };
    this.checkpoints = new Map();
  }

  async execute() {
    this.state.startedAt = new Date().toISOString();
    this.recordStep('initialize', { variant: this.variant, members: this.members.length });

    try {
      await this.validatePreconditions();
      await this.executeVariant();
      this.state.status = 'SUCCEEDED';
    } catch (error) {
      this.state.status = 'FAILED';
      this.state.error = { message: error.message, code: error.code };
      throw error;
    } finally {
      this.state.completedAt = new Date().toISOString();
      this.state.evidence = this.evidence;
      this.state.decisions = this.decisions;
      this.state.handoffs = this.handoffs;
    }

    return this.state;
  }

  async validatePreconditions() {
    this.validateMultiteamCount();
    const variantDef = this.getVariantDefinition();
    if (variantDef.preconditions) {
      for (const precondition of variantDef.preconditions) {
        this.recordStep('precondition_check', { precondition });
        if (!this.checkPrecondition(precondition)) {
          throw coded(`Precondition failed: ${precondition}`, 'ATEAM_PRECONDITION_FAILED');
        }
      }
    }
  }

  validateMultiteamCount() {
    if (this.variant !== 'multiteam') return;
    const teams = this.mission.subTeams || this.mission.teams || [];
    if (teams.length < 2) throw coded('Multiteam system requires at least 2 sub-teams.', 'ATEAM_MULTITEAM_MIN_TEAMS');
  }

  checkPrecondition(precondition) {
    if (precondition.startsWith('minMembers >=')) {
      const min = parseInt(precondition.match(/\d+/)[0]);
      return this.members.length >= min;
    }
    if (precondition === 'diverse_expertise') {
      const allExpertise = new Set(this.members.flatMap(m => m.expertise || m.capabilities || []));
      return allExpertise.size >= this.members.length;
    }
    if (precondition === 'ordered_stages') {
      return this.mission.stages && this.mission.stages.length > 0;
    }
    if (precondition === 'defined_contracts') {
      return this.members.every(m => m.inputSchema && m.outputSchema);
    }
    if (precondition === 'multiple_domains') {
      const domains = new Set(this.members.map(m => m.domain || m.subSystem || m.role).filter(Boolean));
      return domains.size >= 2;
    }
    if (precondition === 'defined_interfaces') {
      return this.boundaries.interfaces && this.boundaries.interfaces.length > 0;
    }
    if (precondition === 'urgent_mission') {
      return this.mission.urgentMandate !== undefined;
    }
    if (precondition === 'bounded_scope') {
      return this.mission.urgentMandate?.scope !== undefined;
    }
    if (precondition === 'explicit_mandate') {
      return this.mission.urgentMandate?.scope && this.mission.urgentMandate?.timeboxMinutes;
    }
    if (precondition === 'multi_role_team') {
      const roles = new Set(this.mission.incidentRoles ? Object.values(this.mission.incidentRoles) : []);
      return roles.size >= 4;
    }
    if (precondition === 'defined_operational_periods') {
      return this.mission.sitrepIntervalMinutes && this.mission.operationalObjectives;
    }
    if (precondition === 'multiple_subteams') {
      return this.mission.teams && this.mission.teams.length >= 2;
    }
    if (precondition === 'meta_mission') {
      return this.mission.systemObjectives && this.mission.systemObjectives.length > 0;
    }
    if (precondition === 'uncertain_requirements') {
      return this.mission.uncertainty >= 0.7 || this.mission.evolvingRequirements === true;
    }
    if (precondition === 'evolving_mission') {
      return this.mission.requiredCapabilities && this.mission.requiredCapabilities.length > 0;
    }
    if (precondition === 'sequential_execution') {
      return this.mission.handoffSequence && this.mission.handoffSummary;
    }
    if (precondition === 'single_context_holder') {
      return this.members.length === 2;
    }
    return true;
  }

  getVariantDefinition() {
    const { VARIANTS } = require('./variantRegistry');
    return VARIANTS[this.variant];
  }

  async executeVariant() {
    switch (this.variant) {
      case 'expert_committee':
        return this.executeExpertCommittee();
      case 'pipeline':
        return this.executePipeline();
      case 'project_dag':
        return this.executeProjectDag();
      case 'cross_functional_pod':
        return this.executeCrossFunctionalPod();
      case 'boundary_spanner':
        return this.executeBoundarySpanner();
      case 'matrix_team':
        return this.executeMatrixTeam();
      case 'tiger_team':
        return this.executeTigerTeam();
      case 'incident_command':
        return this.executeIncidentCommand();
      case 'multiteam':
        return this.executeMultiteam();
      case 'adaptive':
        return this.executeAdaptive();
      case 'relay_team':
        return this.executeRelayTeam();
      default:
        throw coded(`Unknown variant: ${this.variant}`, 'ATEAM_VARIANT_UNKNOWN');
    }
  }

  recordStep(name, data) {
    this.state.steps.push({ name, at: new Date().toISOString(), data });
  }

  recordEvidence(type, data) {
    this.evidence.push({ type, at: new Date().toISOString(), data });
  }

  recordDecision(type, data) {
    this.decisions.push({ type, at: new Date().toISOString(), data });
  }

  recordHandoff(type, data) {
    this.handoffs.push({ type, at: new Date().toISOString(), data });
  }

  checkpoint(key, data) {
    this.checkpoints.set(key, { at: new Date().toISOString(), data });
  }

  getCheckpoint(key) {
    return this.checkpoints.get(key);
  }

}

Object.assign(VariantExecutionRuntime.prototype, require("./variantExecutionExpertDag"), require("./variantExecutionAuthority"), require("./variantExecutionCoordination"));

async function executeVariantMission(...args) {
  return new VariantExecutionRuntime(...args).execute();
}

module.exports = { VariantExecutionRuntime, executeVariantMission };
