'use strict';

// MCP inventory: canonical catalog, tools exposed by each server, schemas,
// leases, handlers and tests. Scope: shared/toolDefinitions.json,
// mcp/*, crates/genos-mcp, backend/tests/test_mcp_server_parity.js.
// Exposure is lease-dependent: no lease means no tools (fail-closed).
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./inventory_lib');

const CANONICAL = 'shared/toolDefinitions.json';
const BUNDLED = 'mcp/toolDefinitions.json';

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function catalogShapes() {
  const canonical = lib.readJson(CANONICAL);
  const bundled = lib.readJson(BUNDLED);
  const names = lib.toolNames(canonical);
  const bundledNames = lib.toolNames(bundled);
  const tools = canonical.tools || canonical;
  return { canonical: names.length, bundled: bundledNames.length,
    canonicalNames: names,
    onlyCanonical: names.filter((n) => !bundledNames.includes(n)),
    onlyBundled: bundledNames.filter((n) => !names.includes(n)),
    withoutSchema: tools.filter((t) => !t.inputSchema).map((t) => t.name).sort() };
}

function nodeServer() {
  const dir = path.join(lib.root, 'mcp');
  const files = fs.readdirSync(dir);
  const text = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  return { entry: 'mcp/index.js',
    catalogLoader: files.includes('catalog.js'),
    leaseFilter: files.includes('lease.js') && text('lease.js').includes('filterLeasedTools'),
    handlerFactory: text('toolCallHandler.js').includes('createToolCallHandler'),
    schemaResolver: files.includes('contract.js'),
    strategyBridge: files.includes('strategyBridge.js'),
    tests: files.filter((f) => /^test_/.test(f)).sort() };
}

function leaseRule() {
  const lease = process.env.GENOS_MCP_LEASE;
  const disabled = (process.env.GENOS_MCP_DISABLED_TOOLS || '').split(',')
    .map((s) => s.trim()).filter(Boolean);
  return { envLease: lease ? lease.split(',').map((s) => s.trim()).filter(Boolean) : [],
    envDisabled: disabled, failClosed: !lease };
}

function rustServer() {
  const dir = path.join(lib.root, 'crates/genos-mcp/src');
  const tools = path.join(dir, 'tools.rs');
  const catalogTools = path.join(dir, 'tools/catalog_tools.rs');
  const baseSpecs = path.join(dir, 'tools/base_specs.rs');
  const bridge = path.join(dir, 'executor/backend_dispatch.rs');
  const main = path.join(dir, 'main.rs');
  const src = readIfExists(tools);
  const catalogSrc = readIfExists(catalogTools);
  const baseSrc = readIfExists(baseSpecs);
  const bridgeSrc = readIfExists(bridge);
  const catalog = lib.readJson(CANONICAL);
  const catalogToolsList = catalog.tools || catalog;
  const nativeTools = [...new Set([...baseSrc.matchAll(/"name"\s*:\s*"(genos_[^"]+)"/g)]
    .map((match) => match[1]))].sort();
  const routedTools = Object.fromEntries(catalogToolsList
    .filter((tool) => ['backend', 'orchestrator'].includes(tool['x-genos-rust-route']))
    .map((tool) => [tool.name, tool['x-genos-rust-route']])
    .sort(([left], [right]) => left.localeCompare(right)));
  const unavailableList = bridgeSrc.match(/UNAVAILABLE_TOOLS: &\[&str\] = &\[([\s\S]*?)\]/)?.[1] || '';
  const unavailableInRust = [...unavailableList.matchAll(/"(genos_[^"]+)"/g)]
    .map((match) => match[1]).sort();
  const names = [...new Set([...nativeTools, ...Object.keys(routedTools)])].sort();
  return { entry: 'crates/genos-mcp/src/main.rs',
    leaseEnv: src.includes('GENOS_MCP_LEASE') && src.includes('GENOS_MCP_DISABLED_TOOLS'),
    outsideLeaseRefusal: readIfExists(main).includes('outside the active GenOS MCP lease'),
    canonicalBridge: catalogSrc.includes('shared/toolDefinitions.json')
      && catalogSrc.includes('x-genos-rust-route'),
    nativeTools,
    routedTools,
    declaredTools: names,
    unavailableInRust };
}

function backendDispatch() {
  const file = 'backend/src/services/mcpExecutor/transports/toolLogic.js';
  const src = lib.readText(file);
  const custom = [...src.matchAll(/^\s{2}([a-z0-9_]+):\s*(?:\(args\)|[\w]+,)/gm)].map((m) => m[1]);
  return { dispatcher: file,
    customHandlers: [...new Set(custom)].sort(),
    bioTools: src.includes('executeBioTool'), strategyTools: src.includes('executeStrategyTool'),
    genomeTools: src.includes('executeGenomeTool') };
}

function audit() {
  const catalogs = catalogShapes();
  return { scope: 'mcp', method: 'catalog-and-server-scan',
    caveat: 'Listed tools are definitions; runtime exposure requires a lease.',
    canonicalCatalog: CANONICAL, catalogs, nodeServer: nodeServer(),
    lease: leaseRule(), rustServer: rustServer(), backendDispatch: backendDispatch(),
    parityTest: 'backend/tests/test_mcp_server_parity.js' };
}

if (require.main === module) {
  const result = audit();
  lib.emit(result, `mcp: catalogs ${result.catalogs.canonical}/${result.catalogs.bundled} `
    + `(no-schema ${result.catalogs.withoutSchema.length}), `
    + `rust tools ${result.rustServer.declaredTools.length}, `
    + `lease ${result.lease.failClosed ? 'absent (fail-closed)' : 'present'}, `
    + `node tests ${result.nodeServer.tests.length}.`);
}

module.exports = { audit, rustServer };
