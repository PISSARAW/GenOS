const SUCCESS_STATUS = 'completed';

function summarizeAgents(agents = []) {
  const statuses = agents.map((agent) => agent.status);
  if (statuses.length > 0 && statuses.every((status) => status === SUCCESS_STATUS)) {
    return { success: true, verdict: SUCCESS_STATUS };
  }
  if (statuses.includes('unverified')) return { success: false, verdict: 'unverified' };
  if (statuses.some((status) => ['failed', 'error', 'quarantined', 'apoptosis'].includes(status))) {
    return { success: false, verdict: 'failed' };
  }
  return { success: false, verdict: 'incomplete' };
}

module.exports = { summarizeAgents };
