/**
 * GenOS MCP HTTP phase helpers.
 * Split from transports/http.js so every unit stays inside the gate.
 * Two fixes live here:
 * - TimeoutError (AbortSignal.timeout) is mapped to an explicit MCP timeout
 *   error instead of leaking a bare DOMException message.
 * - the notifications/initialized message is best-effort: it never fails the
 *   tools/call, it only logs a warning.
 */

function buildContext(url, deadlineAt) {
  const token = process.env.GENOS_MCP_TOKEN || '';
  const lease = process.env.GENOS_MCP_LEASE || '';
  const disabled = process.env.GENOS_MCP_DISABLED_TOOLS || '';
  const context = {
    url: url,
    deadlineAt: deadlineAt,
    protocolHeaders: { 'MCP-Protocol-Version': '2025-06-18' },
    leaseHeaders: {},
    auth: {}
  };
  if (token) context.auth = { authorization: 'Bearer ' + token };
  if (lease) context.leaseHeaders['X-GenOS-MCP-Lease'] = lease;
  if (disabled) context.leaseHeaders['X-GenOS-MCP-Disabled-Tools'] = disabled;
  return context;
}

function mergeHeaders(context, sessionId) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  Object.assign(headers, context.protocolHeaders, context.leaseHeaders, context.auth);
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  return headers;
}

function mapTimeoutError(error, phase) {
  if (error.name === 'TimeoutError') return new Error('MCP HTTP ' + phase + ' timed out (explicit timeout).');
  return error;
}

function notificationWarning(error) {
  if (error.name === 'TimeoutError') return 'MCP HTTP notifications/initialized timed out (continuing without acknowledgement).';
  return String(error.message || error);
}

async function initializeSession(deps, context) {
  const initResponse = await deps.fetchHttpPhase(context.url, {
    method: 'POST',
    headers: mergeHeaders(context, null),
    body: JSON.stringify(deps.rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } }))
  }, context.deadlineAt, 'initialize', async (response) => {
    if (!response.ok) throw new Error(await deps.describeHttpError(response, 'initialize'));
    return { payload: await deps.readMcpHttpResponse(response), sessionId: response.headers.get('mcp-session-id') };
  });
  const initPayload = deps.assertRpcResponse(initResponse.payload, 1, 'initialize');
  if (initPayload.error) throw new Error(initPayload.error.message || 'MCP initialize failed.');
  return { sessionId: initResponse.sessionId };
}

async function sendInitializedNotification(deps, notice) {
  try {
    await fetch(notice.context.url, {
      method: 'POST',
      headers: mergeHeaders(notice.context, notice.sessionId),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
      signal: AbortSignal.timeout(Math.max(1000, notice.context.deadlineAt - Date.now()))
    });
  } catch (error) {
    console.warn('[mcp-http] initialized notification best-effort failed: ' + notificationWarning(error));
  }
}

async function callTool(deps, invocation) {
  try {
    const raw = await deps.fetchHttpPhase(invocation.context.url, {
      method: 'POST',
      headers: mergeHeaders(invocation.context, invocation.sessionId),
      body: JSON.stringify(deps.rpcRequest(2, 'tools/call', { name: invocation.toolName, arguments: invocation.toolArgs }))
    }, invocation.context.deadlineAt, 'tools/call', async (response) => {
      if (!response.ok) throw new Error(await deps.describeHttpError(response, 'tools/call'));
      return deps.readMcpHttpResponse(response);
    });
    const payload = deps.assertRpcResponse(raw, 2, 'tools/call');
    if (payload.error) throw new Error(payload.error.message || 'MCP tools/call failed.');
    return payload.result || payload;
  } catch (error) {
    throw mapTimeoutError(error, 'tools/call');
  }
}

module.exports = { buildContext, mergeHeaders, mapTimeoutError, initializeSession, sendInitializedNotification, callTool };
