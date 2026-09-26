'use strict';

const { validateInterTeamContracts } = require('./interTeamContractService');
const { compileProgramWorkGraph } = require('./programWorkGraph');
const { buildCoordinationCouncil } = require('./coordinationCouncilService');

const DEFAULT_LIMITS = Object.freeze({ maxTeams: 12, maxMembers: 120, maxDepth: 2 });

function composeMultiteam(input = {}) {
  const teams = Array.isArray(input.teams) ? input.teams : [];
  const limits = { ...DEFAULT_LIMITS, ...(input.limits || {}) };
  validateCaps(teams, limits, input.depth || 1);
  const contracts = Array.isArray(input.contracts) ? input.contracts : [];
  const validation = validateInterTeamContracts(teams, contracts);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { code: 'ATEAM_MTS_CONTRACT_INVALID', errors: validation.errors });
  const objectives = programObjectives(input);
  const budget = allocateProgramBudgets(teams, input.globalBudget || input.budget);
  return { teams, contracts, graph: compileProgramWorkGraph(teams, contracts), council: buildCoordinationCouncil(teams, input.council), objectives, budget };
}

function programObjectives(input) {
  const local = (Array.isArray(input.teams) ? input.teams : []).map((team) => ({ teamId: team.teamId, objective: team.objective || team.goal || null }));
  return { system: input.systemObjective || null, local, complete: Boolean(input.systemObjective) && local.every((entry) => entry.objective) };
}

function allocateProgramBudgets(teams, source) {
  if (!source) return { global: null, local: {}, enforced: false };
  const global = typeof source === 'number' ? { tokens: source } : { ...source };
  const dimensions = ['tokens', 'compute', 'time'];
  const explicit = Object.fromEntries(teams.map((team) => [team.teamId, typeof team.budget === 'number' ? { tokens: team.budget } : team.budget || {}]));
  const local = {};
  for (const dimension of dimensions) {
    allocateBudgetDimension({ dimension, teams, explicit, global, local });
  }
  return { global, local, enforced: true, allocation: 'hard_limit' };
}

function allocateBudgetDimension(input) {
  const { dimension, teams, explicit, global, local } = input;
  const assigned = teams.filter((team) => Number.isFinite(Number(explicit[team.teamId][dimension])));
  const unassigned = teams.filter((team) => !assigned.includes(team));
  const assignedTotal = assigned.reduce((sum, team) => sum + Number(explicit[team.teamId][dimension]), 0);
  if (Number.isFinite(global[dimension]) && assignedTotal > global[dimension]) throw Object.assign(new Error(`Subteam ${dimension} budgets exceed the global limit.`), { code: 'ATEAM_MTS_BUDGET_EXCEEDED' });
  for (const team of teams) local[team.teamId] = local[team.teamId] || {};
  for (const team of assigned) local[team.teamId][dimension] = Number(explicit[team.teamId][dimension]);
  const remainder = Number.isFinite(global[dimension]) ? global[dimension] - assignedTotal : null;
  const weight = unassigned.reduce((sum, team) => sum + teamWeight(team), 0);
  for (const team of unassigned) if (remainder !== null && weight) local[team.teamId][dimension] = Math.floor(remainder * teamWeight(team) / weight);
}

function teamWeight(team) {
  return Math.max(1, Number(team.weight) || (team.members || []).length || 1);
}

function validateCaps(teams, limits, depth) {
  const members = teams.reduce((sum, team) => sum + (Array.isArray(team.members) ? team.members.length : 0), 0);
  const errors = [];
  if (!teams.length || teams.length > limits.maxTeams) errors.push('Team count is outside the configured limit.');
  if (members > limits.maxMembers) errors.push('Member count exceeds the configured limit.');
  if (depth > limits.maxDepth) errors.push('Nested team depth exceeds the configured limit.');
  if (teams.some((team) => !team.teamId)) errors.push('Every team requires a teamId.');
  if (new Set(teams.map((team) => team.teamId)).size !== teams.length) errors.push('Team identifiers must be unique.');
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { code: 'ATEAM_MTS_LIMIT', errors });
}

module.exports = { composeMultiteam, DEFAULT_LIMITS };
