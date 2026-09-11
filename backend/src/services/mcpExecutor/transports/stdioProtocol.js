/**
 * GenOS MCP STDIO protocol codecs.
 * Pure message builders and line framing shared by the stdio transport.
 * No process handling here (see stdioProcess.js).
 */
const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_NAME = 'genos-backend';
const CLIENT_VERSION = '1.0.0';

function initializeRequest() {
  return { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION } } };
}

function initializedNotification() {
  return { jsonrpc: '2.0', method: 'notifications/initialized', params: {} };
}

function toolsCallRequest(toolName, toolArgs) {
  return { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } };
}

function encodeLine(payload) {
  return JSON.stringify(payload) + '\n';
}

function splitLines(buffer) {
  const lines = [];
  let rest = buffer;
  while (true) {
    const lineEnd = rest.indexOf('\n');
    if (lineEnd === -1) break;
    lines.push(rest.slice(0, lineEnd));
    rest = rest.slice(lineEnd + 1);
  }
  return { lines: lines, rest: rest };
}

module.exports = { PROTOCOL_VERSION, initializeRequest, initializedNotification, toolsCallRequest, encodeLine, splitLines };
