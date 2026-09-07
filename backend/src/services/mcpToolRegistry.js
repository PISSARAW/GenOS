const { MCP_TOOLS_LIST } = require('../db/seedTools');
const mcpStrategyTools = require('./mcpStrategyTools');
const mcpBioTools = require('./mcpBioTools');

function normalizeToolName(toolName) {
  return String(toolName || '').trim();
}

function declaredToolNames() {
  return [...new Set((MCP_TOOLS_LIST || []).map((tool) => normalizeToolName(tool.name)).filter(Boolean))];
}

function isRegisteredTool(toolName) {
  const normalized = normalizeToolName(toolName);
  return declaredToolNames().includes(normalized);
}

function detectExecutionKind(toolName) {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return 'unsupported';

  if (mcpStrategyTools.isStrategyTool(normalized)) return 'strategy';
  if (normalized.startsWith('genos_biomimicry_') || normalized.includes('conscience') || normalized.includes('entropy')) return 'bio';
  if (normalized.startsWith('genos_')) return 'cli';
  return 'unsupported';
}

function isSupportedTool(toolName) {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return false;

  return isRegisteredTool(normalized);
}

async function dispatchTool(toolName, args = {}) {
  const normalized = normalizeToolName(toolName);
  const kind = detectExecutionKind(normalized);

  if (kind === 'strategy') {
    const result = await mcpStrategyTools.executeStrategyTool(normalized, args || {});
    return { kind, result };
  }

  if (kind === 'bio') {
    const result = await mcpBioTools.executeBioTool(normalized, args || {});
    return { kind, result };
  }

  if (kind === 'cli') {
    const { executeConfiguredTransport } = require('./mcpExecutor');
    const result = await executeConfiguredTransport({ toolName: normalized, args: args || {} });
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
