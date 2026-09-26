'use strict';

const { validateSchema } = require('./variantExecutionService');

function buildVariantPolicyForTeam(team, mission) {
  return {
    variant: team.variant,
    minMembers: team.minMembers || 2,
    customPolicy: team.customPolicy || {}
  };
}

function buildIntegrationCouncil(teamConfigs, mission) {
  return {
    members: teamConfigs.map((t) => t.teamId),
    chair: mission.councilChair || teamConfigs[0]?.teamId,
    cadence: mission.councilCadence || 600000,
    authority: mission.councilAuthority || 'advisory',
    decisions: []
  };
}

function buildInterTeamContracts(teamConfigs, mission) {
  const contracts = [];
  for (let i = 0; i < teamConfigs.length; i++) {
    for (let j = i + 1; j < teamConfigs.length; j++) {
      const contract = mission.contracts?.[`${teamConfigs[i].teamId}-${teamConfigs[j].teamId}`];
      if (contract) {
        contracts.push({
          from: teamConfigs[i].teamId,
          to: teamConfigs[j].teamId,
          ...contract,
          validated: false
        });
      }
    }
  }
  return contracts;
}

function identifyBoundarySpanners(teamConfigs, mission) {
  return (mission.boundarySpanners || []).map((spanner) => ({
    ...spanner,
    fromTeam: spanner.fromTeam,
    toTeam: spanner.toTeam,
    translationSchema: spanner.translationSchema || {}
  }));
}

function allocateLocalBudgets(teamConfigs, globalBudget, strategy) {
  const budgets = {};
  const totalWeight = teamConfigs.reduce((sum, t) => sum + (t.weight || 1), 0);

  for (const team of teamConfigs) {
    const weight = team.weight || 1;
    const ratio = strategy === 'proportional' ? weight / totalWeight : 1 / teamConfigs.length;
    budgets[team.teamId] = {
      tokens: Math.floor((globalBudget.tokens || 0) * ratio),
      compute: Math.floor((globalBudget.compute || 0) * ratio),
      time: Math.floor((globalBudget.time || 0) * ratio)
    };
  }
  return budgets;
}

function buildTeamConfigs(teams) {
  return teams.map((team, index) => ({
    teamId: team.teamId || `team_${index + 1}`,
    variant: team.variant || 'expert_committee',
    members: team.members || [],
    localObjectives: team.objectives || [],
    weight: team.weight || 1,
    variantPolicy: buildVariantPolicyForTeam(team, {})
  }));
}

function buildMultiteamSystem(teamConfigs, mission) {
  return {
    recursive: true,
    maxDepth: mission.maxRecursionDepth || 3,
    teamOfTeams: teamConfigs
  };
}

function buildBudget(teamConfigs, mission) {
  const globalBudget = mission.globalBudget || { tokens: 0, compute: 0, time: 0 };
  const localBudgets = allocateLocalBudgets(teamConfigs, globalBudget, mission.budgetAllocation || 'proportional');
  return {
    global: globalBudget,
    local: localBudgets,
    enforcement: 'hard_limit'
  };
}

function buildConflictDetection(mission) {
  return {
    enabled: true,
    checkInterval: mission.conflictCheckInterval || 60000,
    detectors: ['resource_contention', 'objective_misalignment', 'contract_violation', 'priority_conflict'],
    resolution: mission.conflictResolution || 'council_mediation'
  };
}

function buildCoordination(mission) {
  return {
    syncCadence: mission.syncCadence || 300000,
    sharedArtifacts: mission.sharedArtifacts || [],
    knowledgeSync: mission.knowledgeSync !== false
  };
}

function multiteamPolicy(mission, members) {
  const teams = Array.isArray(mission.subTeams) ? mission.subTeams
    : Array.isArray(mission.teams) ? mission.teams : [];
  if (teams.length < 2) throw coded('Multiteam system requires at least 2 sub-teams.', 'ATEAM_MULTITEAM_MIN_TEAMS');

  const teamConfigs = buildTeamConfigs(teams);
  const systemObjectives = mission.systemObjectives || [];

  return {
    multiteamSystem: buildMultiteamSystem(teamConfigs, mission),
    systemObjectives,
    localObjectives: teamConfigs.flatMap((t) => t.localObjectives),
    integrationCouncil: buildIntegrationCouncil(teamConfigs, mission),
    interTeamContracts: buildInterTeamContracts(teamConfigs, mission),
    boundarySpanners: identifyBoundarySpanners(teamConfigs, mission),
    budget: buildBudget(teamConfigs, mission),
    systemicConflictDetection: buildConflictDetection(mission),
    coordination: buildCoordination(mission)
  };
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }
module.exports = { multiteamPolicy };