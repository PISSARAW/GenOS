'use strict';

const organization = require('../src/services/dynamicOrganizationService');

async function handleWorkerStatus({ db, request, orchestratorId }) {
  const requesterAgentId = String(process.env.GENOS_AGENT_ID || '').trim();
  if (!requesterAgentId) throw new Error('GENOS_AGENT_ID is required for organization communication.');
  const workers = await organization.getWorkerStatusForMember(db, {
    orchestratorId,
    requesterAgentId,
    workerId: request.worker_id || request.workerId,
    limit: request.limit
  });
  process.stdout.write(JSON.stringify(workers));
}

module.exports = { handleWorkerStatus };
