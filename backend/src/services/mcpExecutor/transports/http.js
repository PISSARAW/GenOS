const sessionCache = new Map();

async function callHttpFn(url, toolName, options = {}) {
  const { fetchHttpPhase, readMcpHttpResponse, assertRpcResponse, describeHttpError, rpcRequest, normalizeMcpTimeout } = require('../../mcpExecutor');
  const { args = {} } = options;
  const timeoutMs = normalizeMcpTimeout(options.timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  const auth = process.env.GENOS_MCP_TOKEN ? { authorization: `Bearer ${process.env.GENOS_MCP_TOKEN}` } : {};
  const protocolHeaders = { 'MCP-Protocol-Version': '2025-06-18' };
  const lease = process.env.GENOS_MCP_LEASE;
  const disabled = process.env.GENOS_MCP_DISABLED_TOOLS;
  const leaseHeaders = { ...(lease ? { 'X-GenOS-MCP-Lease': lease } : {}), ...(disabled ? { 'X-GenOS-MCP-Disabled-Tools': disabled } : {}) };

  let session = sessionCache.get(url);
  if (!session) {
    const initResponse = await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...protocolHeaders, ...leaseHeaders, ...auth }, body: JSON.stringify(rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } })) }, deadlineAt, 'initialize', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'initialize'));
      return { payload: await readMcpHttpResponse(response), sessionId: response.headers.get('mcp-session-id') };
    });
    const initPayload = assertRpcResponse(initResponse.payload, 1, 'initialize');
    if (initPayload.error) throw new Error(initPayload.error.message || 'MCP initialize failed.');
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...protocolHeaders, ...(initResponse.sessionId ? { 'Mcp-Session-Id': initResponse.sessionId } : {}), ...leaseHeaders, ...auth }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }), signal: AbortSignal.timeout(Math.max(1000, deadlineAt - Date.now())) });
    session = { sessionId: initResponse.sessionId };
    sessionCache.set(url, session);
  }

  const sessionHeaders = session.sessionId ? { 'Mcp-Session-Id': session.sessionId } : {};
  try {
    const payload = assertRpcResponse(await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...protocolHeaders, ...sessionHeaders, ...leaseHeaders, ...auth }, body: JSON.stringify(rpcRequest(2, 'tools/call', { name: toolName, arguments: args })) }, deadlineAt, 'tools/call', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'tools/call'));
      return readMcpHttpResponse(response);
    }), 2, 'tools/call');
    if (payload.error) throw new Error(payload.error.message || 'MCP tools/call failed.');
    return payload.result || payload;
  } catch (error) {
    if (error.message?.includes('session') || error.message?.includes('Session')) {
      sessionCache.delete(url);
    }
    throw error;
  }
}

module.exports = { callHttpFn };
