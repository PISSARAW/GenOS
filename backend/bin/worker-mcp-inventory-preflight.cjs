'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildMcpServerEnvironment } = require('../src/services/agentRuntimeMcpConfiguration');

const COORDINATION_TOOLS = Object.freeze([
  'genos_organization_state', 'genos_worker_inbox', 'genos_worker_publish'
]);

function continuousCoordination(mission = {}) {
  const policy = mission.coordinationPolicy || mission.coordination_policy || {};
  const cadence = policy.communicationCadence || policy.communication_cadence;
  return mission.organization === 'cross_functional_pod'
    || String(cadence || '').toLowerCase() === 'continuous_sync';
}

function requiredWorkerTools(mission = {}) {
  return continuousCoordination(mission) ? [...COORDINATION_TOOLS] : [];
}

function toolNames(listResult) {
  const tools = Array.isArray(listResult) ? listResult : listResult?.tools;
  return [...new Set((tools || []).map((tool) => tool && tool.name).filter(Boolean))];
}

function validateInventory(state, availableTools) {
  const available = new Set(availableTools);
  const missingLease = state.toolLease.filter((tool) => !available.has(tool));
  const missingRequired = [...state.requiredTools].filter((tool) => !available.has(tool));
  if (!missingLease.length && !missingRequired.length) return;
  throw Object.assign(new Error(`Worker MCP inventory is incomplete: ${[...new Set([...missingLease, ...missingRequired])].join(', ')}.`), {
    code: 'WORKER_MCP_INVENTORY_INCOMPLETE', missingLease, missingRequired, availableTools
  });
}

function resolveSdkRoot(input) {
  const relative = path.join('mcp', 'node_modules', '@modelcontextprotocol', 'sdk');
  const workspaceSdk = path.join(input.binaries.workspace, relative);
  if (fs.existsSync(path.join(workspaceSdk, 'dist', 'esm', 'client', 'index.js'))) return workspaceSdk;
  return path.resolve(__dirname, '..', '..', relative);
}

async function connectClient(input) {
  if (!input.mcp?.mcpCommand) {
    throw Object.assign(new Error('Worker MCP server executable is unavailable.'), {
      code: 'WORKER_MCP_SERVER_UNAVAILABLE'
    });
  }
  const sdkRoot = resolveSdkRoot(input);
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(pathToFileURL(path.join(sdkRoot, 'dist', 'esm', 'client', 'index.js')).href),
    import(pathToFileURL(path.join(sdkRoot, 'dist', 'esm', 'client', 'stdio.js')).href)
  ]);
  const env = buildMcpServerEnvironment({ state: input.state, binaries: input.binaries });
  const transport = new StdioClientTransport({
    command: input.mcp.mcpCommand, args: input.mcp.mcpArgs,
    cwd: input.binaries.workspace, stderr: 'pipe', env: { ...process.env, ...env }
  });
  transport.stderr.on('data', () => {});
  const client = new Client({ name: 'genos-worker-inventory-preflight', version: '1' });
  await client.connect(transport);
  return client;
}

async function runWorkerMcpInventoryPreflight(input) {
  let client;
  try {
    client = input.listTools ? null : await connectClient(input);
    const result = input.listTools ? await input.listTools() : await client.listTools();
    const availableTools = toolNames(result);
    validateInventory(input.state, availableTools);
    return { availableTools, requiredTools: [...input.state.requiredTools] };
  } catch (failure) {
    input.state.emit?.({ eventType: 'AGENT_FAILED', action: 'MCP_PREFLIGHT', status: 'error',
      detail: failure.message, payload: { code: failure.code || 'WORKER_MCP_PREFLIGHT_FAILED' } });
    throw failure;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

module.exports = { COORDINATION_TOOLS, continuousCoordination, requiredWorkerTools,
  toolNames, validateInventory, resolveSdkRoot, runWorkerMcpInventoryPreflight };
