'use strict';

const TERMINAL_STATUSES = new Set([
  'blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined'
]);
const TERMINAL_RUN_STATUSES = new Set(['completed', 'awaiting_approval', 'failed', 'blocked', 'cancelled']);

function agentTerminal(agent) {
  if (TERMINAL_STATUSES.has(agent.status)) return true;
  // Un agent en statut 'running' sans runtime_pid est un processus orphelin :
  // le worker child n'a jamais pu être lancé (spawn échoué, EPIPE, etc.).
  // On le considère comme terminal pour ne pas bloquer l'orchestre indéfiniment.
  if (agent.status === 'running' && !agent.runtime_pid) return true;
  return agent.status === 'idle' && TERMINAL_RUN_STATUSES.has(agent.latest_run_status);
}

function agentsQuiescent(agents, orchestratorId) {
  return agents.length > 0 && agents.every((agent) => {
    // L'orchestre est le processus appelant ; son propre runtime_pid ne doit
    // pas bloquer l'évaluation de quiescence. Seuls les workers délégués
    // doivent être sans processus associé et dans un état terminal.
    if (agent.id === orchestratorId) return agentTerminal(agent);
    return !agent.runtime_pid && agentTerminal(agent);
  });
}

function missionExecutionTerminal(agents, worlds, orchestratorId) {
  if (!agentsQuiescent(agents, orchestratorId)) return false;
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
