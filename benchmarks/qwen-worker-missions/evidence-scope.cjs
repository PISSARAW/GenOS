'use strict';
const terminalTypes = new Set(['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED']);
function cliReceipt(log) {
  const objects = String(log || '').split(/\r?\n/).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  return objects.filter(row => typeof row.workerId === 'string' && typeof row.orchestratorId === 'string'
    && Array.isArray(row.agents) && row.agents.some(agent => agent.id === row.workerId)).at(-1) || null;
}
function missionScope(inspection) {
  const cli = inspection.cli;
  if (!cli) return null;
  const agent = (inspection.agents || []).find(row => row.id === cli.workerId);
  if (agent?.execution_mode !== 'worker' || agent.parent_agent_id !== cli.orchestratorId) return null;
  const matches = (inspection.missions || []).filter(row => row.orchestrator_agent_id === cli.orchestratorId
    && (inspection.members || []).some(member => member.mission_id === row.mission_id && member.agent_id === agent.id));
  return matches.length === 1 ? { workerId: agent.id, missionId: matches[0].mission_id } : null;
}
function invocationMeasured(terminal, run, expectedModel) {
  let metrics;
  try { metrics = JSON.parse(run.metrics_json || '{}'); } catch { return false; }
  return terminal.provider === 'ollama' && /^ollama:\/\/qwen/i.test(expectedModel || '') && terminal.model === expectedModel
    && Number.isSafeInteger(terminal.usage?.tokens) && terminal.usage.tokens > 0
    && metrics.tokens === terminal.usage.tokens;
}
function select(inspection) {
  const scope = missionScope(inspection);
  if (!scope) return { reason: 'CLI worker identity or mission membership is missing or ambiguous.' };
  const run = (inspection.runs || []).filter(row => row.agent_id === scope.workerId).at(-1);
  const binding = (inspection.bindings || []).find(row => row.run_id === run?.id);
  if (!run || binding?.agent_id !== scope.workerId || binding.mission_id !== scope.missionId) return { reason: 'Latest intended worker run has no matching mission binding.' };
  if (!['completed','failed','blocked','cancelled'].includes(run.status)) return { reason: 'Latest intended worker run is not terminal.' };
  return selectTerminal(inspection, scope, run);
}
function selectTerminal(inspection, scope, run) {
  const terminal = (inspection.events || []).filter(event => event.agentId === scope.workerId
    && event.run === run.id && terminalTypes.has(event.type)).at(-1);
  if (!terminal || (terminal.type === 'AGENT_COMPLETED' && run.status !== 'completed')) return { reason: 'No consistent terminal event for intended worker run.' };
  if (terminal.modelUsageAccounting?.complete === false) return {
    ...scope, run, terminal, modelInvocationMeasured: false,
    reason: 'Model usage is incomplete: at least one provider attempt has no measured token receipt.'
  };
  return { ...scope, run, terminal, modelInvocationMeasured: invocationMeasured(terminal, run, inspection.expectedModel) };
}
module.exports = { cliReceipt, select };
