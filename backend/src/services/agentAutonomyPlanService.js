const { buildAutonomyPlan, applySurvivalConstraints } = require('./autonomousOrchestrationService');
const { buildAllocation } = require('./tokenAllocationService');
const { regulateAutonomyPlan } = require('./controlRegulationService');
const trinityService = require('./trinityService');
const aTeamService = require('./aTeamService');
const aTeamRunStore = require('./aTeam/teamRunStore');
const workGraphCompiler = require('./aTeam/workGraph/workGraphCompiler');
const workGraphStore = require('./aTeam/workGraph/workGraphStore');
const topologySessionStore = require('./topologySessionStore');
const aTeamCoordination = require('./aTeamCoordinationService');
const dynamicOrganization = require('./dynamicOrganizationService');
const { emit } = require('./agentOrchestrationState');
const { consultLocalModels } = require('./agentModelRoutingService');
const topologyCapabilityService = require('./topologyCapabilityService');
const selfModel = require('./selfModelService');
const autobiographicalRecall = require('./autobiographicalMemory/orchestratorRecall');
const survivalState = require('./survivalStateService');
const cognitivePhenotype = require('./cognitivePhenotypeService');
const { prepareTeamLifecycle } = require('./aTeam/lifecycle/teamLifecycleService');

function clampShare(value) {
  return Math.max(0, Math.min(1, value));
}

function resolveWorkerShare(missionBudget) {
  if (Number.isFinite(Number(missionBudget.workerShare))) {
    return clampShare(Number(missionBudget.workerShare));
  }
  const policy = missionBudget.tokenPolicy;
  if (policy && Number.isFinite(Number(policy.workerShare))) {
    return clampShare(Number(policy.workerShare));
  }
  return 0.6;
}

function resolveOrchestratorReserve(missionBudget, workerShare) {
  if (Number.isFinite(Number(missionBudget.orchestratorReserve))) {
    return clampShare(Number(missionBudget.orchestratorReserve));
  }
  const policy = missionBudget.tokenPolicy;
  if (policy && Number.isFinite(Number(policy.orchestratorReserve))) {
    return clampShare(Number(policy.orchestratorReserve));
  }
  return 1 - workerShare;
}

function resolveEffectiveWorkerShare(autonomyPlan, configuredWorkerShare) {
  const policy = autonomyPlan.tokenPolicy;
  if (policy && Number.isFinite(Number(policy.workerShare)) && policy.workerShare > 0) {
    return policy.workerShare;
  }
  return configuredWorkerShare;
}

function resolveEffectiveOrchestratorReserve(autonomyPlan, configuredReserve) {
  const policy = autonomyPlan.tokenPolicy;
  if (policy && Number.isFinite(Number(policy.orchestratorReserve))) {
    return policy.orchestratorReserve;
  }
  return configuredReserve;
}

function affordableWorkerCount(tokenPolicy, workerShare) {
  return Math.floor((tokenPolicy.total * workerShare) / tokenPolicy.minimumWorkerTokens);
}

function buildRoundAllocation(tokenPolicy, workerShare, workerCount) {
  return buildAllocation({
    totalTokens: tokenPolicy.total,
    workerShare,
    workerCount,
    minimumWorkerTokens: tokenPolicy.minimumWorkerTokens,
    mode: tokenPolicy.allocation
  });
}

function missionText(normalizedMission) {
  return normalizedMission.prompt || normalizedMission.currentTask || '';
}

function attachAteamCoordination({ aTeam, agentId, normalizedMission, emitEvent = emit }) {
  try {
    const coordinated = aTeamCoordination.coordinateMembers(aTeam.members, { enforceCapabilities: false });
    aTeam.organization = coordinated.organization;
    aTeam.capabilityContract = coordinated.capabilityContract;
    aTeam.capabilityAudit = coordinated.capabilityAudit;
    aTeam.handoffs = coordinated.handoffs;
    if (normalizedMission) {
      const lifecycle = prepareTeamLifecycle({
        goal: missionText(normalizedMission),
        successCriteria: normalizedMission.successCriteria || normalizedMission.acceptanceCriteria,
        organization: coordinated.organization,
        members: aTeam.members,
        requiredCapabilities: aTeam.requiredCapabilities || []
      });
      aTeam.prebrief = lifecycle.prebrief;
      aTeam.teamContract = lifecycle.teamContract;
      aTeam.readiness = lifecycle.readiness;
      if (!lifecycle.readiness.ready) {
        aTeam.activated = false;
        aTeam.reason = `A-Team is not ready: ${lifecycle.readiness.blockers.join(', ')}.`;
        emitEvent(agentId, 'A_TEAM_BLOCKED', 'TEAM_READINESS_GATE', aTeam.reason, lifecycle.readiness, 'warning');
      }
    }
    if (coordinated.capabilityAudit.missing.length) {
      aTeam.activated = false;
      aTeam.reason = `A-Team capabilities are unavailable: ${coordinated.capabilityAudit.missing.join(', ')}.`;
      emitEvent(agentId, 'A_TEAM_SKIPPED', 'CAPABILITY_GUARD', aTeam.reason, aTeam, 'warning');
    }
  } catch (error) {
    emitEvent(agentId, 'A_TEAM_COORDINATION_FAILED', 'CAPABILITY_GUARD', error.message, { error: error.message }, 'warning');
  }
  return aTeam;
}

function activateTrinity({ autonomyPlan, agentId, effectiveWorkerShare, effectiveOrchestratorReserve, trinityWorkerCount }) {
  autonomyPlan.tokenPolicy.workerShare = effectiveWorkerShare;
  autonomyPlan.tokenPolicy.orchestratorReserve = effectiveOrchestratorReserve;
  autonomyPlan.tokenPolicy.rounds = buildRoundAllocation(autonomyPlan.tokenPolicy, effectiveWorkerShare, trinityWorkerCount);
  autonomyPlan.workers = autonomyPlan.trinity.members;
  autonomyPlan.dispatchWorkers = autonomyPlan.trinity.members;
  emit(agentId, 'TRINITY_PLANNED', 'COMPOSE_TRINITY', 'The mission explicitly requested Trinity; three evidence-comparison worlds were planned.', autonomyPlan.trinity, 'info');
}

function calculateTrinityEngagement(autonomyPlan, normalizedMission, effectiveWorkerShare) {
  const trinityWorkerCount = autonomyPlan.trinity.members.length;
  const affordableTrinityMembers = affordableWorkerCount(autonomyPlan.tokenPolicy, effectiveWorkerShare);
  autonomyPlan.trinity.budgetPermitsLaunch = affordableTrinityMembers >= trinityWorkerCount;
  const minimumTokens = autonomyPlan.tokenPolicy.minimumWorkerTokens * trinityWorkerCount;
  const availableTokens = autonomyPlan.tokenPolicy.total * effectiveWorkerShare;
  autonomyPlan.trinity.ev = trinityService.calculateEvIndex({
    ...(normalizedMission.trinitySignals || {}),
    budgetRatio: availableTokens > 0 ? minimumTokens / availableTokens : Infinity
  });
  const automaticRequest = normalizedMission.trinityMode === 'auto';
  autonomyPlan.trinity.activated = (autonomyPlan.trinity.explicitlyRequested
    || (automaticRequest && autonomyPlan.trinity.ev.eligible))
    && autonomyPlan.trinity.budgetPermitsLaunch;
  return { trinityWorkerCount, affordableTrinityMembers, automaticRequest };
}

function reportTrinityPlan({ autonomyPlan, agentId, automaticRequest, trinityWorkerCount, affordableTrinityMembers }) {
  if (autonomyPlan.trinity.activated) {
    return;
  } else if (automaticRequest && autonomyPlan.trinity.ev.missing.length) {
    autonomyPlan.trinity.reason = `Automatic Trinity engagement needs explicit EV inputs: ${autonomyPlan.trinity.ev.missing.join(', ')}.`;
    emit(agentId, 'TRINITY_SKIPPED', 'INSUFFICIENT_EV_INPUTS', autonomyPlan.trinity.reason, autonomyPlan.trinity.ev, 'warning');
  } else if (autonomyPlan.trinity.recommended && autonomyPlan.trinity.budgetPermitsLaunch) {
    emit(agentId, 'TRINITY_CONSIDERED', 'INTERVIEW_PLAN', 'Trinity is available after the interview if three comparative worlds remain useful; the base worker plan remains active meanwhile.', autonomyPlan.trinity, 'info');
  } else if (autonomyPlan.trinity.recommended) {
    autonomyPlan.trinity.reason = `Trinity needs ${trinityWorkerCount} workers, but the token budget funds only ${affordableTrinityMembers}.`;
    emit(agentId, 'TRINITY_SKIPPED', 'BUDGET_GUARD', autonomyPlan.trinity.reason, autonomyPlan.trinity, 'warning');
  }
}

function applyTrinityPlan({ autonomyPlan, normalizedMission, agentId, effectiveWorkerShare, effectiveOrchestratorReserve }) {
  autonomyPlan.trinity = trinityService.analyzeMission(missionText(normalizedMission));
  const engagement = calculateTrinityEngagement(autonomyPlan, normalizedMission, effectiveWorkerShare);
  if (autonomyPlan.trinity.activated) {
    activateTrinity({ autonomyPlan, agentId, effectiveWorkerShare, effectiveOrchestratorReserve, trinityWorkerCount: engagement.trinityWorkerCount });
  } else {
    reportTrinityPlan({ autonomyPlan, agentId, ...engagement });
  }
}

function activateATeam({ autonomyPlan, agentId, effectiveWorkerShare, effectiveOrchestratorReserve, aTeamWorkerCount }) {
  autonomyPlan.workers = autonomyPlan.aTeam.members;
  autonomyPlan.dispatchWorkers = autonomyPlan.aTeam.members;
  autonomyPlan.tokenPolicy.workerShare = effectiveWorkerShare;
  autonomyPlan.tokenPolicy.orchestratorReserve = effectiveOrchestratorReserve;
  autonomyPlan.tokenPolicy.rounds = buildRoundAllocation(autonomyPlan.tokenPolicy, effectiveWorkerShare, aTeamWorkerCount);
  emit(agentId, 'A_TEAM_PLANNED', 'COMPOSE_TEAM', `Detected multidisciplinary mission across ${autonomyPlan.aTeam.detectedDomains.join(', ')}.`, autonomyPlan.aTeam, 'info');
}

function applyATeamPlan({ autonomyPlan, normalizedMission, agentId, effectiveWorkerShare, effectiveOrchestratorReserve }) {
  autonomyPlan.aTeam = aTeamService.analyzeMission(missionText(normalizedMission));
  const aTeamWorkerCount = autonomyPlan.aTeam.members.length;
  const affordableAteamMembers = affordableWorkerCount(autonomyPlan.tokenPolicy, effectiveWorkerShare);
  autonomyPlan.aTeam.activated = !autonomyPlan.trinity.activated
    && autonomyPlan.aTeam.recommended
    && affordableAteamMembers >= aTeamWorkerCount;
  if (autonomyPlan.aTeam.activated) {
    attachAteamCoordination({ aTeam: autonomyPlan.aTeam, agentId, normalizedMission });
  }
  if (autonomyPlan.aTeam.activated) {
    activateATeam({ autonomyPlan, agentId, effectiveWorkerShare, effectiveOrchestratorReserve, aTeamWorkerCount });
  } else if (autonomyPlan.aTeam.recommended && autonomyPlan.trinity.recommended) {
    autonomyPlan.aTeam.reason = 'A-Team dispatch was deferred so the orchestrator can decide whether Trinity is the better mission shape.';
    emit(agentId, 'A_TEAM_DEFERRED', 'TRINITY_DECISION_GATE', autonomyPlan.aTeam.reason, autonomyPlan.aTeam, 'info');
  } else if (autonomyPlan.aTeam.recommended) {
    autonomyPlan.aTeam.reason = `The mission needs ${aTeamWorkerCount} specialists, but the token budget funds only ${affordableAteamMembers}.`;
    emit(agentId, 'A_TEAM_SKIPPED', 'BUDGET_GUARD', autonomyPlan.aTeam.reason, autonomyPlan.aTeam, 'warning');
  }
}

async function persistATeamRun({ db, agentId, normalizedMission, autonomyPlan }) {
  const aTeam = autonomyPlan.aTeam;
  if (!aTeam || aTeam.activated !== true) return;
  const runDraft = buildATeamRunDraft({ agentId, normalizedMission, autonomyPlan });
  const persisted = await persistRunAndGraph({ db, runDraft, members: aTeam.members });
  applyWorkGraphStages(aTeam.members || [], persisted.graph);
  aTeam.teamRun = persisted.run;
  aTeam.workGraph = persisted.graph;
  emit(agentId, 'A_TEAM_RUN_CREATED', 'PERSIST_TEAM_RUN', `Persisted canonical A-Team run '${persisted.run.teamRunId}' with WorkGraph '${persisted.graph.workGraphId}'.`, {
    teamRunId: persisted.run.teamRunId, workGraphId: persisted.graph.workGraphId,
    revision: persisted.run.revision, memberCount: persisted.run.members.length, criticalPath: persisted.graph.criticalPath.nodeIds
  }, 'info');
}

function buildATeamRunDraft({ agentId, normalizedMission, autonomyPlan }) {
  const aTeam = autonomyPlan.aTeam;
  return aTeamRunStore.teamRunRecord({
    missionId: agentId,
    goal: missionText(normalizedMission),
    successCriteria: normalizedMission.successCriteria || normalizedMission.acceptanceCriteria || [],
    organization: aTeam.organization || autonomyPlan.organization || null,
    requiredCapabilities: aTeam.requiredCapabilities || [],
    capabilityGaps: aTeam.capabilityCoverage?.uncovered || [],
    members: aTeam.members || []
  });
}

async function persistRunAndGraph({ db, runDraft, members }) {
  const graphDraft = workGraphCompiler.compileWorkGraph({ teamRunId: runDraft.teamRunId, members: members || [] });
  const graph = await workGraphStore.create(db, graphDraft);
  let run;
  try {
    run = await aTeamRunStore.create(db, { ...runDraft, workGraphId: graph.workGraphId });
  } catch (error) {
    await topologySessionStore.remove(db, graph.workGraphId);
    throw error;
  }
  return { run, graph };
}

function applyWorkGraphStages(members, graph) {
  for (const member of members) {
    const memberId = member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role;
    member.pipelineStage = graph.memberStages[memberId] || 0;
  }
}

async function applyLocalModelReview({ db, agentId, normalizedMission, autonomyPlan }) {
  const provider = String(normalizedMission.provider || '').toLowerCase();
  if (normalizedMission.executor === 'caller_mcp' || provider.includes('codex') || provider.includes('mcp')) {
    autonomyPlan.localModelReview = { consulted: false, reason: 'Cognition is owned by the MCP caller.' };
    return;
  }
  const modelTenant = normalizedMission.workspaceId
    ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
    : null;
  autonomyPlan.localModelReview = await consultLocalModels({ db, agentId, mission: normalizedMission, plan: autonomyPlan, tenant: modelTenant || {} });
  const consulted = autonomyPlan.localModelReview.consulted;
  const message = consulted
    ? `Local model ${autonomyPlan.localModelReview.selectedModel} reviewed the orchestration plan.`
    : 'No local model review was available; continuing with the frontier orchestrator.';
  emit(agentId, 'LOCAL_MODEL_ROUTING', 'PLAN_REVIEW', message, autonomyPlan.localModelReview, consulted ? 'info' : 'warning');
}

async function applyOrganizationState({ db, agentId, autonomyPlan }) {
  const organizationState = await dynamicOrganization.getState(db, agentId);
  if (!organizationState) {
    const initialized = await dynamicOrganization.changeOrganization(db, {
      orchestratorId: agentId,
      organization: autonomyPlan.organization,
      reason: 'Initial organization selected from the strategy contract.',
      changedBy: agentId
    });
    emit(agentId, 'ORGANIZATION_INITIALIZED', 'ORGANIZE', `Initialized '${initialized.organization}' organization.`, initialized, 'info');
    return;
  }
  autonomyPlan.organization = organizationState.organization;
  emit(agentId, 'ORGANIZATION_RESTORED', 'ORGANIZE', `Restored runtime organization '${organizationState.organization}'.`, organizationState, 'info');
}

function resolveCapabilityMode(autonomyPlan) {
  if (autonomyPlan.trinity && autonomyPlan.trinity.activated) {
    return 'trinity';
  }
  if (autonomyPlan.aTeam && autonomyPlan.aTeam.activated) {
    return 'a_team';
  }
  return null;
}

function applyCapabilityContract(autonomyPlan) {
  autonomyPlan.capabilityContract = topologyCapabilityService.contractFor({
    mode: resolveCapabilityMode(autonomyPlan),
    organization: autonomyPlan.organization
  });
}

function emitControlRegulation(agentId, autonomyPlan) {
  const regulation = autonomyPlan.controlRegulation;
  if (!regulation) return;
  emit(agentId, 'CONTROL_REGULATION_ARBITRATED', 'REGULATE_PLAN', 'Autonomy plan was arbitrated by multi-loop control signals.', regulation, 'info');
}

async function applySelfModel({ db, agentId, normalizedMission, autonomyPlan }) {
  const model = await selfModel.load(db, agentId, { mission: normalizedMission, plan: autonomyPlan });
  selfModel.applyToMission(normalizedMission, model, autonomyPlan);
  applySurvivalConstraints(autonomyPlan);
  autonomyPlan.selfModel = model;
  emit(agentId, 'SELF_MODEL_ASSESSED', 'SELF_REGULATE', model.selfAssessment.join(' '), {
    state: model.state,
    decisionPolicy: model.decisionPolicy,
    knownWeaknesses: model.habits.knownWeaknesses
  }, 'info');
}

async function buildAutonomyPlanForMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord }) {
  const missionBudget = normalizedMission.executionBudget || {};
  const regulationBudget = {
    ...missionBudget,
    survivalState: normalizedMission.survivalState || missionBudget.survivalState
  };
  const configuredWorkerShare = resolveWorkerShare(missionBudget);
  const configuredOrchestratorReserve = resolveOrchestratorReserve(missionBudget, configuredWorkerShare);
  const autonomyPlan = dispatchedAgent.execution_mode === 'orchestrator'
    ? buildAutonomyPlan(contractRecord.contract, regulationBudget)
    : null;
  if (!autonomyPlan) {
    return autonomyPlan;
  }
  const effectiveWorkerShare = resolveEffectiveWorkerShare(autonomyPlan, configuredWorkerShare);
  const effectiveOrchestratorReserve = resolveEffectiveOrchestratorReserve(autonomyPlan, configuredOrchestratorReserve);
  applyTrinityPlan({ autonomyPlan, normalizedMission, agentId, effectiveWorkerShare, effectiveOrchestratorReserve });
  applyATeamPlan({ autonomyPlan, normalizedMission, agentId, effectiveWorkerShare, effectiveOrchestratorReserve });
  await persistATeamRun({ db, agentId, normalizedMission, autonomyPlan });
  const phenotypeReport = cognitivePhenotype.attachPhenotypesToPlan({
    plan: autonomyPlan,
    missionText: missionText(normalizedMission)
  });
  if (phenotypeReport.attached > 0) {
    emit(agentId, 'COGNITIVE_PHENOTYPE_ATTACHED', 'COGNITIVE_COMPOSE', `Composed cognitive recipes for ${phenotypeReport.attached} worker(s).`, { needs: phenotypeReport.needs, recipes: phenotypeReport.attached }, 'info');
  }
  applySurvivalConstraints(autonomyPlan);
  await survivalState.observe(db, agentId, {
    ...autonomyPlan.survival.state,
    activeWorkers: autonomyPlan.workers.length,
    carryingCapacity: autonomyPlan.survival.state.carryingCapacity,
    survivalState: normalizedMission.survivalState
  });
  await applySelfModel({ db, agentId, normalizedMission, autonomyPlan });
  await autobiographicalRecall.recallBeforePlanning({ db, agentId, normalizedMission, autonomyPlan });
  await applyLocalModelReview({ db, agentId, normalizedMission, autonomyPlan });
  await applyOrganizationState({ db, agentId, autonomyPlan });
  applyCapabilityContract(autonomyPlan);
  autonomyPlan.controlRegulation = regulateAutonomyPlan(contractRecord.contract, regulationBudget, autonomyPlan);
  emitControlRegulation(agentId, autonomyPlan);
  return autonomyPlan;
}

module.exports = { buildAutonomyPlanForMission, attachAteamCoordination };
