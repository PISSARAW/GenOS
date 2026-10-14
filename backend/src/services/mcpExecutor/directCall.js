const { getDatabase } = require('../../db');
const circuitBreaker = require('../circuitBreaker');
const { executeConfiguredTransport } = require('./dispatch');
const { applyDomainVerdict, actionSucceeded } = require('./domainVerdict');
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

function normalizeCallOptions(timeoutMs) {
  return typeof timeoutMs === 'object' ? timeoutMs : { timeoutMs };
}

async function executeCall(input) {
  let result;
  try {
    result = await executeConfiguredTransport({ toolName: input.toolName, args: input.args,
      agentId: input.options.agentId || null,
      timeoutMs: normalizeMcpTimeout(input.options.timeoutMs || DEFAULT_MCP_TIMEOUT_MS) });
    applyDomainVerdict(input.toolName, result);
    recordCallResult(input.toolName, result);
  } catch (error) {
    if (!result) circuitBreaker.recordFailure(input.toolName, error.message);
    throw error;
  }
  return result;
}

async function finishCall(input) {
  const { db, toolName, receipt, result } = input;
  const succeeded = actionSucceeded(toolName, result);
  await body.finish({ db, toolName, receipt,
    outcome: { status: succeeded ? 'completed' : 'failed', domainVerdict: result.domainVerdict || null } });
  if (!succeeded) throw Object.assign(new Error(result.output || `MCP tool '${toolName}' failed its domain check.`), { code: 'MCP_DOMAIN_FAILURE' });
  return result.output;
}

async function callTool(toolName, args = {}, timeoutMs = DEFAULT_MCP_TIMEOUT_MS) {
  const options = normalizeCallOptions(timeoutMs);
  const normalizedToolName = String(toolName || '').trim();
  await directCallGuard(normalizedToolName, args);
  const db = await getDatabase();
  const receipt = await body.begin({ db, toolName: normalizedToolName, actor: options.actor });
  await body.audit({ db, toolName: normalizedToolName, receipt, action: 'MCP_DIRECT_CALL', decision: 'allow' });
  let result;
  try {
    result = await executeCall({ toolName: normalizedToolName, args, options });
  } catch (error) {
    await body.finish({ db, toolName: normalizedToolName, receipt,
      outcome: { status: 'failed', code: error.code || null } });
    throw error;
  }
  return finishCall({ db, toolName: normalizedToolName, receipt, result });
}

module.exports = { callTool };
