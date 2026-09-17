const { randomUUID } = require('crypto');

function createOrchestratorId(prefix) {
  return `${String(prefix || 'orchestrator')}_${randomUUID()}`;
}

module.exports = { createOrchestratorId };
