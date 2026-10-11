'use strict';

const TERMINAL_STATUSES = new Set([
  'blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined'
]);
const TERMINAL_RUN_STATUSES = new Set(['completed', 'awaiting_approval', 'failed', 'blocked', 'cancelled']);

function agentTerminal(agent) {
  if (TERMINAL_STATUSES.has(agent.status)) return true;
  return agent.status === 'idle' && TERMINAL_RUN_STATUSES.has(agent.latest_run_status);
}

function agentsQuiescent(agents) {
  return agents.length > 0 && agents.every((agent) => !agent.runtime_pid && agentTerminal(agent));
}

function missionExecutionTerminal(agents, worlds) {
  if (!agentsQuiescent(agents)) return false;
  return worlds.length === 0 || worlds.every((world) => TERMINAL_STATUSES.has(world.status));
}

function resolveFinalMissionStatus(outcome, completionGate, evidence) {
  const { verdict, coverage } = evidence;
  if (outcome.success === true && completionGate.allowed === true && verdict === 'completed') {
    if (coverage?.verdict !== 'required-coverage-complete') return { success: false, verdict: 'required_coverage_incomplete' };
    return { success: true, verdict };
  }
  if (verdict !== 'completed') return { success: false, verdict };
  return { success: false, verdict: completionGate.allowed === true ? outcome.verdict : 'homeostasis_blocked' };
}

module.exports = { TERMINAL_STATUSES, TERMINAL_RUN_STATUSES, agentsQuiescent, missionExecutionTerminal, resolveFinalMissionStatus };
