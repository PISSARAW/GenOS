/**
 * Autonomy plan construction for orchestrator missions: Trinity and A-Team
 * composition, token allocation, local model plan review, and organization
 * initialization.
 */
const { buildAutonomyPlan } = require('./autonomousOrchestrationService');
const { buildAllocation } = require('./tokenAllocationService');
const trinityService = require('./trinityService');
const aTeamService = require('./aTeamService');
const dynamicOrganization = require('./dynamicOrganizationService');
const { emit } = require('./agentOrchestrationState');
const { consultLocalModels } = require('./agentModelRoutingService');

async function buildAutonomyPlanForMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord }) {
  const autonomyPlan = dispatchedAgent.execution_mode === 'orchestrator'
    ? buildAutonomyPlan(contractRecord.contract, normalizedMission.executionBudget)
    : null;
  if (autonomyPlan) {
    autonomyPlan.trinity = trinityService.analyzeMission(normalizedMission.prompt || normalizedMission.currentTask || '');
    const trinityWorkerCount = autonomyPlan.trinity.members.length;
    const affordableTrinityMembers = Math.floor(
      (autonomyPlan.tokenPolicy.total * 0.6) / autonomyPlan.tokenPolicy.minimumWorkerTokens
    );
    autonomyPlan.trinity.budgetPermitsLaunch = affordableTrinityMembers >= trinityWorkerCount;
    autonomyPlan.trinity.activated = autonomyPlan.trinity.explicitlyRequested && autonomyPlan.trinity.budgetPermitsLaunch;
    if (autonomyPlan.trinity.recommended && autonomyPlan.trinity.budgetPermitsLaunch) {
      autonomyPlan.tokenPolicy.workerShare = 0.6;
      autonomyPlan.tokenPolicy.orchestratorReserve = 0.4;
      autonomyPlan.tokenPolicy.rounds = buildAllocation({
        totalTokens: autonomyPlan.tokenPolicy.total,
        workerShare: autonomyPlan.tokenPolicy.workerShare,
        workerCount: trinityWorkerCount,
        minimumWorkerTokens: autonomyPlan.tokenPolicy.minimumWorkerTokens,
        mode: autonomyPlan.tokenPolicy.allocation
      });
      if (autonomyPlan.trinity.activated) {
        autonomyPlan.workers = autonomyPlan.trinity.members;
        autonomyPlan.dispatchWorkers = autonomyPlan.trinity.members;
        emit(agentId, 'TRINITY_PLANNED', 'COMPOSE_TRINITY', 'The mission explicitly requested Trinity; three evidence-comparison worlds were planned.', autonomyPlan.trinity, 'info');
      } else {
        autonomyPlan.workers = [];
        autonomyPlan.dispatchWorkers = [];
        emit(agentId, 'TRINITY_CONSIDERED', 'INTERVIEW_PLAN', 'The mission requests a user interview before planning; Trinity is available after the interview if three comparative worlds remain useful.', autonomyPlan.trinity, 'info');
      }
    } else if (autonomyPlan.trinity.recommended) {
      autonomyPlan.trinity.reason = `Trinity needs ${trinityWorkerCount} workers, but the token budget funds only ${affordableTrinityMembers}.`;
      emit(agentId, 'TRINITY_SKIPPED', 'BUDGET_GUARD', autonomyPlan.trinity.reason, autonomyPlan.trinity, 'warning');
    }
    autonomyPlan.aTeam = aTeamService.analyzeMission(normalizedMission.prompt || normalizedMission.currentTask || '');
    const aTeamWorkerCount = autonomyPlan.aTeam.members.length;
    const affordableAteamMembers = Math.floor(
      (autonomyPlan.tokenPolicy.total * 0.6) / autonomyPlan.tokenPolicy.minimumWorkerTokens
    );
    autonomyPlan.aTeam.activated = !autonomyPlan.trinity.recommended
      && autonomyPlan.aTeam.recommended
      && affordableAteamMembers >= aTeamWorkerCount;
    if (autonomyPlan.aTeam.activated) {
      autonomyPlan.workers = autonomyPlan.aTeam.members;
      autonomyPlan.dispatchWorkers = autonomyPlan.aTeam.members;
      autonomyPlan.tokenPolicy.workerShare = 0.6;
      autonomyPlan.tokenPolicy.orchestratorReserve = 0.4;
      autonomyPlan.tokenPolicy.rounds = buildAllocation({
        totalTokens: autonomyPlan.tokenPolicy.total,
        workerShare: autonomyPlan.tokenPolicy.workerShare,
        workerCount: aTeamWorkerCount,
        minimumWorkerTokens: autonomyPlan.tokenPolicy.minimumWorkerTokens,
        mode: autonomyPlan.tokenPolicy.allocation
      });
      emit(agentId, 'A_TEAM_PLANNED', 'COMPOSE_TEAM', `Detected multidisciplinary mission across ${autonomyPlan.aTeam.detectedDomains.join(', ')}.`, autonomyPlan.aTeam, 'info');
    } else if (autonomyPlan.aTeam.recommended && autonomyPlan.trinity.recommended) {
      autonomyPlan.aTeam.reason = 'A-Team dispatch was deferred so the orchestrator can decide whether Trinity is the better mission shape.';
      emit(agentId, 'A_TEAM_DEFERRED', 'TRINITY_DECISION_GATE', autonomyPlan.aTeam.reason, autonomyPlan.aTeam, 'info');
    } else if (autonomyPlan.aTeam.recommended) {
      autonomyPlan.aTeam.reason = `The mission needs ${aTeamWorkerCount} specialists, but the token budget funds only ${affordableAteamMembers}.`;
      emit(agentId, 'A_TEAM_SKIPPED', 'BUDGET_GUARD', autonomyPlan.aTeam.reason, autonomyPlan.aTeam, 'warning');
    }
    const modelTenant = normalizedMission.workspaceId
      ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
      : null;
    autonomyPlan.localModelReview = await consultLocalModels(db, agentId, normalizedMission, autonomyPlan, modelTenant || {});
    emit(agentId, 'LOCAL_MODEL_ROUTING', 'PLAN_REVIEW', autonomyPlan.localModelReview.consulted ? `Local model ${autonomyPlan.localModelReview.selectedModel} reviewed the orchestration plan.` : 'No local model review was available; continuing with the frontier orchestrator.', autonomyPlan.localModelReview, autonomyPlan.localModelReview.consulted ? 'info' : 'warning');
    const organizationState = await dynamicOrganization.getState(db, agentId);
    if (!organizationState) {
      const initialized = await dynamicOrganization.changeOrganization(db, {
        orchestratorId: agentId,
        organization: autonomyPlan.organization,
        reason: 'Initial organization selected from the strategy contract.',
        changedBy: agentId
      });
      emit(agentId, 'ORGANIZATION_INITIALIZED', 'ORGANIZE', `Initialized '${initialized.organization}' organization.`, initialized, 'info');
    } else {
      autonomyPlan.organization = organizationState.organization;
      emit(agentId, 'ORGANIZATION_RESTORED', 'ORGANIZE', `Restored runtime organization '${organizationState.organization}'.`, organizationState, 'info');
    }
  }
  return autonomyPlan;
}

module.exports = { buildAutonomyPlanForMission };
