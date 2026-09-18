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
  'Fossilisation': 'cli',
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

function recordCircuitOutcome(normalized, result, failureMessage) {
  if (!result || !result.success) {
    if (result && result.configured) circuitBreaker.recordFailure(normalized, result.error || failureMessage);
    return;
  }
  circuitBreaker.recordSuccess(normalized);
}

async function runStrategyTool(normalized, args) {
  const result = await mcpStrategyTools.executeStrategyTool(normalized, args || {});
  recordCircuitOutcome(normalized, result, 'MCP strategy tool failed.');
  return result;
}

async function runBioTool(normalized, args) {
  const result = await mcpBioTools.executeBioTool(normalized, args || {});
  recordCircuitOutcome(normalized, result, 'MCP bio tool failed.');
  return result;
}

async function runCliTool(normalized, args) {
  const { executeConfiguredTransport } = require('./mcpExecutor');
  const result = await executeConfiguredTransport({ toolName: normalized, args: args || {} });
  recordCircuitOutcome(normalized, result, 'MCP tool failed.');
  return result;
}

async function executeRegisteredTool(kind, normalized, args) {
  if (kind === 'strategy') return { handled: true, result: await runStrategyTool(normalized, args) };
  if (kind === 'bio') return { handled: true, result: await runBioTool(normalized, args) };
  if (kind === 'cli') return { handled: true, result: await runCliTool(normalized, args) };
  return { handled: false };
}

function unsupportedResult(normalized) {
  return { configured: false, success: false, status: 'unsupported', error: `Tool '${normalized}' is not registered.` };
}

function invalidArgsResult(argumentError) {
  return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
}

function circuitOpenResult(circuit) {
  return { configured: true, success: false, status: 'circuit_open', error: circuit.message, code: circuit.reason };
}

async function dispatchTool(toolName, args = {}) {
  const normalized = normalizeToolName(toolName);
  const kind = detectExecutionKind(normalized);
  if (!isSupportedTool(normalized)) return { kind: 'unsupported', result: unsupportedResult(normalized) };
  const argumentError = validateToolArguments(normalized, args);
  if (argumentError) return { kind, result: invalidArgsResult(argumentError) };
  const circuit = circuitBreaker.canExecute(normalized, 'operator');
  if (!circuit.allowed) return { kind, result: circuitOpenResult(circuit) };

  const outcome = await executeRegisteredTool(kind, normalized, args);
  if (!outcome.handled) return { kind: 'unsupported', result: null };
  return { kind, result: outcome.result };
}

module.exports = {
  normalizeToolName,
  declaredToolNames,
  isRegisteredTool,
  detectExecutionKind,
  isSupportedTool,
  dispatchTool
};
