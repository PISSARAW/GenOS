const { fetchHttpPhase, readMcpHttpResponse, assertRpcResponse, describeHttpError, readResponseTextBounded, rpcRequest, normalizeMcpTimeout } = require('../../mcpExecutor');

async function callHttpFn(url, toolName, options = {}) {
  const { args = {} } = options;
  const timeoutMs = normalizeMcpTimeout(options.timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  const auth = process.env.GENOS_MCP_TOKEN ? { authorization: `Bearer ${process.env.GENOS_MCP_TOKEN}` } : {};
  const protocolHeaders = { 'MCP-Protocol-Version': '2025-06-18' };
  const lease = process.env.GENOS_MCP_LEASE;
  const disabled = process.env.GENOS_MCP_DISABLED_TOOLS;
  const leaseHeaders = { ...(lease ? { 'X-GenOS-MCP-Lease': lease } : {}), ...(disabled ? { 'X-GenOS-MCP-Disabled-Tools': disabled } : {}) };
  try {
    const initResponse = await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...protocolHeaders, ...leaseHeaders, ...auth }, body: JSON.stringify(rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } })) }, deadlineAt, 'initialize', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'initialize'));
      return { payload: await readMcpHttpResponse(response), sessionId: response.headers.get('mcp-session-id') };
    });
    const initPayload = assertRpcResponse(initResponse.payload, 1, 'initialize');
    const sessionHeaders = initResponse.sessionId ? { 'Mcp-Session-Id': initResponse.sessionId } : {};
    if (initPayload.error) throw new Error(initPayload.error.message || 'MCP initialize failed.');
    await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', ...protocolHeaders, ...sessionHeaders, ...leaseHeaders, ...auth }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) }, deadlineAt, 'initialized notification', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'initialized notification'));
      return null;
    });
    const payload = assertRpcResponse(await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...protocolHeaders, ...sessionHeaders, ...leaseHeaders, ...auth }, body: JSON.stringify(rpcRequest(2, 'tools/call', { name: toolName, arguments: args })) }, deadlineAt, 'tools/call', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'tools/call'));
      return readMcpHttpResponse(response);
    }), 2, 'tools/call');
    if (payload.error) throw new Error(payload.error.message || 'MCP tools/call failed.');
    return payload.result || payload;
  } catch (error) {
    throw error;
  }
}

module.exports = { callHttpFn };
