const { MCP_TOOLS_LIST } = require('../db/seedTools');
const mcpStrategyTools = require('./mcpStrategyTools');
const mcpBioTools = require('./mcpBioTools');
const { validateToolArguments } = require('./mcpArgumentValidation');
const circuitBreaker = require('./circuitBreaker');

const CATEGORY_KIND_MAP = {
  'Strategy Primitives': 'strategy',
  'Swarm Biomimicry': 'bio',
  'Epigenetics': 'bio',
  'Cellular': 'bio',
  'Genetics': 'bio',
  'Neurobiology': 'bio',
  'Ecology': 'bio',
  'Resilience & Security': 'bio',
  'Experimental Labs': 'cli',
  'Workspace Control': 'cli',
  'Knowledge & Experience': 'cli',
  'Orchestration': 'cli',
};

function normalizeToolName(toolName) {
  return String(toolName || '').trim();
}

const { REQUIRED_STRINGS } = require('./mcpArgumentValidation');

function declaredToolNames() {
  return [...new Set((MCP_TOOLS_LIST || []).map((tool) => normalizeToolName(tool.name)).filter(Boolean))];
}

function getToolCategory(toolName) {
  const normalized = normalizeToolName(toolName);
  const tool = (MCP_TOOLS_LIST || []).find(t => normalizeToolName(t.name) === normalized);
  return tool?.cat || '';
}

function isRegisteredTool(toolName) {
  const normalized = normalizeToolName(toolName);
  return declaredToolNames().includes(normalized) || mcpStrategyTools.isStrategyTool(normalized) || mcpBioTools.isBioTool(normalized) || Boolean(REQUIRED_STRINGS?.[normalized]);
}

function detectExecutionKind(toolName) {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return 'unsupported';
  if (!isRegisteredTool(normalized)) return 'unsupported';

  if (mcpStrategyTools.isStrategyTool(normalized)) return 'strategy';
  if (mcpBioTools.isBioTool(normalized)) return 'bio';
  const category = getToolCategory(normalized);
  if (CATEGORY_KIND_MAP[category]) return CATEGORY_KIND_MAP[category];
  return 'cli';
}

function isSupportedTool(toolName) {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return false;

  return isRegisteredTool(normalized);
}

async function dispatchTool(toolName, args = {}) {
  const normalized = normalizeToolName(toolName);
  const kind = detectExecutionKind(normalized);
  if (!isSupportedTool(normalized)) return { kind: 'unsupported', result: { configured: false, success: false, status: 'unsupported', error: `Tool '${normalized}' is not registered.` } };
  const argumentError = validateToolArguments(normalized, args);
  if (argumentError) return { kind, result: { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code } };
  const circuit = circuitBreaker.canExecute(normalized, 'operator');
  if (!circuit.allowed) return { kind, result: { configured: true, success: false, status: 'circuit_open', error: circuit.message, code: circuit.reason } };

  if (kind === 'strategy') {
    const result = await mcpStrategyTools.executeStrategyTool(normalized, args || {});
    if (result?.success) circuitBreaker.recordSuccess(normalized);
    else if (result?.configured) circuitBreaker.recordFailure(normalized, result?.error || 'MCP strategy tool failed.');
    return { kind, result };
  }

  if (kind === 'bio') {
    const result = await mcpBioTools.executeBioTool(normalized, args || {});
    if (result?.success) circuitBreaker.recordSuccess(normalized);
    else if (result?.configured) circuitBreaker.recordFailure(normalized, result?.error || 'MCP bio tool failed.');
    return { kind, result };
  }

  if (kind === 'cli') {
    const { executeConfiguredTransport } = require('./mcpExecutor');
    const result = await executeConfiguredTransport({ toolName: normalized, args: args || {} });
    if (result?.success) circuitBreaker.recordSuccess(normalized);
    else if (result?.configured) circuitBreaker.recordFailure(normalized, result?.error || 'MCP tool failed.');
    return { kind, result };
  }

  return { kind: 'unsupported', result: null };
}

module.exports = {
  normalizeToolName,
  declaredToolNames,
  isRegisteredTool,
  detectExecutionKind,
  isSupportedTool,
  dispatchTool
};
