'use strict';

const PRIMITIVES = {
  genos_search_failures: 'search_failures',
  genos_diagnose: 'diagnose',
  genos_analyze_trajectory: 'analyze_trajectory'
};
const STRATEGIES = new Set(['genos_record_experience', 'genos_compile_memory', 'genos_blame']);

function isDevelopmentTool(name) {
  return Object.hasOwn(PRIMITIVES, name) || STRATEGIES.has(name) || name === 'genos_record_decision';
}

function validateInput(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object.');
  if (name === 'genos_diagnose') validateHypotheses(args);
  if (name === 'genos_record_decision') validateDecision(args);
}

function validateHypotheses(args) {
  if (typeof args.task !== 'string' || !args.task.trim()) throw new Error('task is required.');
  if (!Array.isArray(args.hypotheses) || !args.hypotheses.length) throw new Error('Provide falsifiable hypotheses; this route does not generate them with another model.');
  if (args.hypotheses.some((item) => !item || typeof item.statement !== 'string' || !item.statement.trim())) throw new Error('Each hypothesis requires a statement.');
}

function validateDecision(args) {
  for (const field of ['agentId', 'title', 'decision']) {
    if (typeof args[field] !== 'string' || !args[field].trim()) throw new Error(`${field} is required.`);
  }
  if (!Array.isArray(args.evidence) || !args.evidence.length) throw new Error('Non-empty evidence references are required.');
  if (args.evidence.some((item) => typeof item !== 'string' || !item.trim())) throw new Error('Evidence references must be non-empty strings.');
}

function assertAccess(name) {
  if (!require('./mcpExecutor/config').directToolLeaseAllows(name)) throw new Error(`Tool '${name}' is outside the active GenOS MCP lease.`);
  const circuit = require('./circuitBreaker').canExecute(name, 'operator');
  if (!circuit.allowed) throw new Error(circuit.message || 'MCP circuit is open.');
}

async function recordDecision(args) {
  const { randomUUID } = require('node:crypto');
  const db = await require('../db').getDatabase();
  const id = `decision-${randomUUID()}`;
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, args.title, JSON.stringify(args), JSON.stringify(args.evidence), args.agentId, 'Decision',
    args.organizationId || null, args.projectId || null
  );
  return { success: true, decisionId: id, persisted: true, promoted: false };
}

async function executeDevelopmentTool(name, args) {
  assertAccess(name);
  validateInput(name, args);
  if (name === 'genos_record_decision') return recordDecision(args);
  if (STRATEGIES.has(name)) {
    const result = await require('./mcpStrategyTools').executeStrategyTool(name, args);
    if (!result?.success) throw new Error(result?.output?.error || result?.error || 'Development tool failed.');
    return result.output;
  }
  if (!Object.hasOwn(PRIMITIVES, name)) throw new Error(`Unsupported development tool: ${name}`);
  const result = await require('./strategyExecutionAdapter').executePrimitive(PRIMITIVES[name], args);
  if (result?.success !== true) throw new Error(result?.error || 'Primitive did not confirm success.');
  return result;
}

module.exports = { isDevelopmentTool, executeDevelopmentTool };
