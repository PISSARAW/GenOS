/**
 * GenOS MCP STDIO transport (thin orchestrator).
 * Session lifecycle and EPIPE-safe IO live in stdioProcess.js, message
 * codecs in stdioProtocol.js. Behavior matches the previous inline
 * implementation: initialize handshake, best-effort initialized
 * notification, tools/call, bounded protocol diagnostics.
 */
const { startSession, sendRequest, notify, shutdown } = require('./stdioProcess');
const { initializeRequest, initializedNotification, toolsCallRequest } = require('./stdioProtocol');

async function callStdioFn(transport, toolName, options = {}) {
  const executor = require('../../mcpExecutor');
  const commandLine = transport.command;
  const cmdArgs = transport.args || [];
  const toolArgs = options.args || {};
  const timeoutMs = executor.normalizeMcpTimeout(options.timeoutMs);
  const session = startSession({
    parseArgs: executor.parseArgs,
    mcpTransportEnvironment: executor.mcpTransportEnvironment,
    commandLine: commandLine,
    cmdArgs: cmdArgs,
    toolName: toolName,
    timeoutMs: timeoutMs
  });
  try {
    const initialized = await sendRequest(session, 1, initializeRequest());
    if (initialized.error) throw new Error(initialized.error.message || 'MCP STDIO initialize failed.');
    notify(session, initializedNotification());
    const response = await sendRequest(session, 2, toolsCallRequest(toolName, toolArgs));
    if (response.error) throw new Error(response.error.message || 'MCP STDIO tools/call failed.');
    return response.result || response;
  } finally {
    shutdown(session);
  }
}

module.exports = { callStdioFn };
