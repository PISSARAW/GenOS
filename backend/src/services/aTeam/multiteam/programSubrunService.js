'use strict';

const sessions = require('../../topologySessionStore');
const runStore = require('../teamRunStore');
const runtime = require('../aTeamRuntime');
const { prepareDispatchPolicy } = require('../dispatchPolicyService');
const { canonicalJson } = require('../variants/variantExecutionHelpers');

async function createProgramSubrun(input = {}) {
  const state = await loadProgram(input);
  const parent = await authorizedParent(input, state);
  const team = state.teams.find((entry) => entry.teamId === input.teamId);
  if (!team) throw coded('Unknown program subteam.', 'ATEAM_MTS_TEAM_UNKNOWN');
  const definition = team.definition;
  const budget = team.budget;
  requireSubrunContract(definition, budget);
  const selected = prepareDispatchPolicy({ mission: { ...definition, goal: definition.objective },
    members: definition.members, totalBudget: budget.tokens });
  const binding = { programId: state.programId, teamId: team.teamId,
    parentTeamRunId: parent.teamRunId, parentMissionId: parent.missionId,
    authorizedBy: input.orchestratorId, budget };
  const created = await runtime.createRun({ db: input.db, missionId: parent.missionId,
    idempotencyKey: `${state.programId}:${team.teamId}`, goal: definition.objective,
    organization: selected.policy.organization, successCriteria: definition.acceptanceCriteria || [],
    members: selected.members, status: 'READY', phase: 'PREBRIEF',
    execution: { runnerLease: null, organizationPolicy: selected.policy, programBinding: binding } });
  if (canonicalJson(created.run.execution?.programBinding) !== canonicalJson(binding)) {
    throw coded('Existing subrun binding differs from the current program contract.',
      'ATEAM_MTS_SUBRUN_BINDING_CONFLICT');
  }
  return created;
}

function requireSubrunContract(definition, budget) {
  if (!definition?.variant || definition.variant === 'multiteam' || !definition?.objective || !Array.isArray(definition.members)
    || !definition.members.length || !Number.isSafeInteger(budget?.tokens) || budget.tokens <= 0) {
    throw coded('Subteam requires an explicit variant, objective, members and token budget.',
      'ATEAM_MTS_SUBRUN_CONTRACT_REQUIRED');
  }
}

async function loadProgram(input) {
  const record = await sessions.load(input.db, input.programId);
  if (record?.topology !== 'a_team_program') {
    throw coded('Unknown A-Team program run.', 'ATEAM_MTS_PROGRAM_UNKNOWN');
  }
  return record.state;
}

async function authorizedParent(input, state) {
  const parent = state.parentTeamRunId && await runStore.load(input.db, state.parentTeamRunId);
  const agent = input.orchestratorId && await input.db.get('SELECT id FROM agents WHERE id = ?', input.orchestratorId);
  if (!parent || !agent || parent.missionId !== input.orchestratorId
    || parent.execution?.organizationPolicy?.variant !== 'multiteam'
    || !['READY', 'RUNNING'].includes(parent.status)) {
    throw coded('Program subrun requires its active parent and authorized orchestrator.',
      'ATEAM_MTS_PARENT_AUTHORITY_REQUIRED');
  }
  return parent;
}

function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { createProgramSubrun };
