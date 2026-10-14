const { getDatabase } = require('../../db');
const circuitBreaker = require('../circuitBreaker');
const { executeConfiguredTransport } = require('./dispatch');
const { DEFAULT_MCP_TIMEOUT_MS, normalizeMcpTimeout, directCallGuard } = require('./config');
const body = require('./directBodyReceipt');

function recordCallResult(toolName, result) {
  if (result.success) {
    circuitBreaker.recordSuccess(toolName);
    return;
  }
  if (result.configured) circuitBreaker.recordFailure(toolName, result.error || result.output || 'MCP tool failed.');
  throw Object.assign(new Error(result.error || result.output || `MCP tool '${toolName}' failed.`), { code: result.code || 'MCP_TOOL_ERROR' });
}

async function callTool(toolName, args = {}, timeoutMs = DEFAULT_MCP_TIMEOUT_MS) {
  const options = typeof timeoutMs === 'object' ? timeoutMs : { timeoutMs };
  const normalizedToolName = String(toolName || '').trim();
  await directCallGuard(normalizedToolName, args);
  const db = await getDatabase();
  const receipt = await body.begin({ db, toolName: normalizedToolName, actor: options.actor });
  await body.audit({ db, toolName: normalizedToolName, receipt, action: 'MCP_DIRECT_CALL', decision: 'allow' });
  let result;
  try {
    result = await executeConfiguredTransport({ toolName: normalizedToolName, args,
      agentId: options.agentId || null,
      timeoutMs: normalizeMcpTimeout(options.timeoutMs || DEFAULT_MCP_TIMEOUT_MS) });
    recordCallResult(normalizedToolName, result);
  } catch (error) {
    circuitBreaker.recordFailure(normalizedToolName, error.message);
    await body.finish({ db, toolName: normalizedToolName, receipt,
      outcome: { status: 'failed', code: error.code || null } });
    throw error;
  }
  await body.finish({ db, toolName: normalizedToolName, receipt, outcome: { status: 'completed' } });
  return result.output;
}

module.exports = { callTool };
