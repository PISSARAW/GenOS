const strategyContracts = require('./strategyContractService');
const { buildAutonomyPlan } = require('./autonomousOrchestrationService');
const { MCP_TOOLS_LIST } = require('../db/seedTools');

const MCP_TOOL_COUNT = MCP_TOOLS_LIST.length;

function observedTools(events) {
  const found = new Set();
  for (const event of events) {
    const text = `${event.action || ''} ${event.detail || ''} ${event.payload_json || ''}`;
    for (const tool of text.match(/genos_[a-z_]+/g) || []) found.add(tool);
  }
  return [...found].sort();
}

async function auditMission(db, orchestratorId) {
  const contract = await strategyContracts.getLatestContract(db, orchestratorId);
  if (!contract) throw new Error(`No strategy contract for orchestrator ${orchestratorId}`);
  const plan = buildAutonomyPlan(contract.contract);
  const events = await db.all(`SELECT event_type, action, detail, payload_json FROM telemetry_events
    WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at`, orchestratorId, orchestratorId);
  const used = observedTools(events);
  const required = plan.requiredTools || [];
  const gateTools = [...new Set((plan.decisionGates || []).flatMap((gate) => gate.actions || []))];
  const decisions = events.filter((event) => event.event_type === 'ORCHESTRATION_DECISION').map((event) => event.action);
  return {
    orchestratorId, protocol: { advertisedTools: MCP_TOOL_COUNT, observedTools: used, observedCount: used.length },
    strategies: { registryTotal: contract.contract.strategy_registry?.total, evaluated: contract.contract.strategy_decisions?.length || 0, selected: contract.contract.strategy_portfolio?.map((item) => item.id) || [] },
    orchestration: { requiredTools: required, missingRequiredTools: required.filter((tool) => !used.includes(tool)), decisionGateTools: gateTools, decisions },
    verdict: required.every((tool) => used.includes(tool)) ? 'required-coverage-complete' : 'required-coverage-incomplete'
  };
}

module.exports = { MCP_TOOL_COUNT, observedTools, auditMission };
