/**
 * GenOS MCP HTTP transport (thin orchestrator).
 * Phase logic lives in httpPhases.js: initialize handshake, best-effort
 * initialized notification (warn-and-continue), then tools/call with
 * explicit MCP timeout errors.
 */
const { buildContext, initializeSession, sendInitializedNotification, callTool } = require('./httpPhases');

async function callHttpFn(url, toolName, options = {}) {
  const deps = require('../../mcpExecutor');
  const context = buildContext(url, Date.now() + deps.normalizeMcpTimeout(options.timeoutMs));
  const toolArgs = options.args || {};
  const session = await initializeSession(deps, context);
  await sendInitializedNotification(deps, { context: context, sessionId: session.sessionId });
  return callTool(deps, { context: context, sessionId: session.sessionId, toolName: toolName, toolArgs: toolArgs });
}

module.exports = { callHttpFn };
