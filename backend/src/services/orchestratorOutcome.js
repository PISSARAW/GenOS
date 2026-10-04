const SUCCESS_STATUS = 'completed';

function summarizeAgents(agents = []) {
  const statuses = agents.map((agent) => agent.status);
  const evidence = agents
    .filter(a => a.evidence_ref || a.capsule_ref || a.report)
    .map(a => ({
      agent_id: a.id,
      evidence_ref: a.evidence_ref,
      capsule_ref: a.capsule_ref,
      report: a.report,
      status: a.status,
    }));
  const verdict = (() => {
    if (statuses.length > 0 && statuses.every((status) => status === SUCCESS_STATUS)) {
      return SUCCESS_STATUS;
    }
    if (statuses.includes('unverified')) return 'unverified';
    if (statuses.some((status) => ['failed', 'error', 'quarantined', 'apoptosis'].includes(status))) {
      return 'failed';
    }
    return 'incomplete';
  })();
  return { success: verdict === SUCCESS_STATUS, verdict, evidence };
}

module.exports = { summarizeAgents };
