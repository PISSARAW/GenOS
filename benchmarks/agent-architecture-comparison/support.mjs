const TERMINAL_AGENT_STATES = new Set(['idle', 'error', 'blocked', 'terminated', 'apoptosis']);
const TERMINAL_ROOT_EVENTS = new Set(['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR']);

export function orchestrationFinished(agents, rootEvents) {
  return agents.length > 0
    && rootEvents.some((event) => TERMINAL_ROOT_EVENTS.has(event))
    && agents.every((agent) => TERMINAL_AGENT_STATES.has(agent.status));
}
