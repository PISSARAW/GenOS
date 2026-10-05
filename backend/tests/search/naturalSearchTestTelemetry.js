// Keep unit/runtime tests isolated from the production telemetry database.
const events = [];
require('../../src/services/agentOrchestrationState').emit = (...args) => { events.push(args); };
module.exports = { events };
