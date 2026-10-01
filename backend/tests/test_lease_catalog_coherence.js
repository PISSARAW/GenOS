'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leasePolicy = require('../src/services/toolLeasePolicy');
const matrix = require('../src/services/capabilityAccessMatrix');
const registry = require('../src/services/mcpToolRegistry');
const topology = require('../src/services/topologyCapabilityService');
const mcpCoherence = require('../../scripts/ci/check_mcp_coherence');

const repoRoot = path.resolve(__dirname, '..', '..');
const sharedCatalog = JSON.parse(fs.readFileSync(path.join(repoRoot, 'shared', 'toolDefinitions.json'), 'utf8'));
const mcpCatalog = JSON.parse(fs.readFileSync(path.join(repoRoot, 'mcp', 'toolDefinitions.json'), 'utf8'));
const catalogNames = new Set(sharedCatalog.tools.map((tool) => tool.name));
const mcpNames = new Set(mcpCatalog.tools.map((tool) => tool.name));
const handlerSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'toolCallHandler.js'), 'utf8');
const rustToolSourceFiles = ['tools.rs', 'tools/base_specs.rs', 'tools/catalog_tools.rs'];
const rustSource = rustToolSourceFiles.map((file) => fs.readFileSync(
  path.join(repoRoot, 'crates', 'genos-mcp', 'src', file), 'utf8'
)).join('\n');
const daemonGenome = JSON.parse(fs.readFileSync(path.join(repoRoot, 'agents', 'daemons', 'resident_daemon.agent.json'), 'utf8'));

function leasedTools() {
  return [...new Set([...leasePolicy.WORKER_BASE_LEASE, ...leasePolicy.ORCHESTRATOR_CORE_LEASE])];
}

function capabilityTools() {
  const tools = new Set();
  for (const list of Object.values(leasePolicy.CAPABILITY_TOOLS)) {
    for (const tool of list) tools.add(tool);
  }
  return [...tools];
}

// 1. Leases : fail-closed, sans elargissement, sans genos_orchestrate.
assert.ok(!leasedTools().includes('genos_orchestrate'), 'leases must never carry genos_orchestrate');
for (const tool of [...leasedTools(), ...capabilityTools()]) {
  assert.ok(leasePolicy.KNOWN_TOOL_ALLOW_LIST.includes(tool), `${tool} must stay within the known allow-list`);
  assert.ok(registry.isRegisteredTool(tool), `${tool} must have an effective backend route`);
}

// 2. Catalogue : les outils loues de base restent visibles quand ils sont catalogues.
assert.ok(catalogNames.has('genos_philosophy'), 'genos_philosophy must be in the canonical catalog');
assert.ok(mcpNames.has('genos_philosophy'), 'genos_philosophy must be in the bundled catalog');
assert.ok(rustSource.includes('"name": "genos_philosophy"'), 'Rust MCP must advertise leased philosophy access');
assert.ok(fs.readFileSync(path.join(repoRoot, 'crates', 'genos-mcp', 'src', 'executor.rs'), 'utf8').includes('"genos_philosophy"'), 'Rust MCP must route philosophy to its dedicated bridge');
assert.ok(handlerSource.includes("if (name === 'genos_philosophy')"), 'philosophy must use its dedicated local route');
assert.ok(handlerSource.includes('has no verified MCP route'), 'router must refuse tools without verified implementation');
assert.ok(!handlerSource.includes('defaults a'), 'router must not fall through to a generic orchestration');
const routedCatalogTools = sharedCatalog.tools.map((tool) => tool.name)
  .filter((name) => mcpCoherence.audit().verified.names.includes(name)).sort();
assert.deepEqual([...matrix.CATALOGUED_TOOLS].sort(), routedCatalogTools,
  'capability access matrix must match catalog tools with verified MCP routes');

// 3. Gaps explicites : outils loues absents du catalogue public (phase 2 :
// preuve/memoire/topologie). Ils restent routes cote backend mais doivent
// rejoindre le catalogue canonique ; tout nouveau gap fait echouer le test.
const KNOWN_CATALOG_GAPS = new Set([
  'genos_hypothesis_evidence', 'genos_diff',
  'genos_evaluate_trajectories', 'genos_fork', 'genos_create',
  'genos_solve', 'genos_adversarial_review',
  'genos_resilience_hypermutation', 'genos_security_coevolution'
]);
const missing = leasedTools().filter((tool) => !catalogNames.has(tool));
assert.deepEqual(new Set(missing), KNOWN_CATALOG_GAPS, `catalog gaps must stay explicit, got ${missing.join(',')}`);
assert.ok(!missing.includes('genos_philosophy'), 'philosophy gap must stay closed');

// 4. Capacites : aucune capacite MCP annoncee sans catalogue et route réelle.
for (const capability of topology.GENOS_CAPABILITIES) {
  const entry = matrix.accessFor(capability);
  assert.ok(entry.level, `${capability} must have an explicit access level`);
  if (entry.level === matrix.ACCESS_MCP_TOOL) {
    assert.ok(entry.tools.length > 0, `${capability} marked mcp_tool needs tools`);
    assert.deepEqual(entry.missingFromCatalog, [], `${capability} tools must exist in canonical catalog`);
    assert.deepEqual(entry.missingRoutes, [], `${capability} tools must have MCP call routes`);
  }
  if (entry.level === matrix.ACCESS_INTERNAL) {
    assert.equal(entry.state, 'operationnel', `${capability} internal runtime must not be reported conceptual`);
  }
  if (entry.level === matrix.ACCESS_INTERNAL || entry.level === matrix.ACCESS_PARTIAL) {
    assert.ok(entry.service, `${capability} marked ${entry.level} needs a responsible service`);
  }
}
for (const name of ['SWARM_METRICS', 'CONSCIENCE_HOMEOSTASIS', 'CHAOS_ENGINEERING', 'MODEL_ROUTING', 'LOCAL_INFERENCE', 'INFERENCE_GATEWAY', 'COMPLIANCE']) {
  const entry = matrix.accessFor(name);
  assert.ok(entry.level !== matrix.ACCESS_MCP_TOOL, `${name} must not look like a leased MCP tool`);
}

// 6. Modes : aucun mode ne parait pleinement outille si une capacite est partielle/interne.
for (const audit of matrix.auditModes()) {
  const hasGap = audit.entries.some((entry) => entry.level !== matrix.ACCESS_MCP_TOOL);
  if (hasGap) assert.ok(!audit.fullyTooled, `mode ${audit.mode} must not look fully tooled`);
}

// 7. Roles : worker borne, reviewer/observer ajoutent seulement review, sub-orchestrateur borne.
const workerBase = leasePolicy.workerLeaseForRole('implementation');
assert.ok(workerBase.includes('genos_philosophy'), 'worker keeps read-only philosophy');
assert.ok(!workerBase.includes('genos_adversarial_review'), 'worker base must not carry review');
assert.ok(!workerBase.includes('genos_security_coevolution'), 'worker base must not carry security');
assert.ok(!workerBase.includes('genos_record_decision'), 'worker base must not carry promotion');
assert.ok(!workerBase.includes('genos_delegate_worker'), 'worker base must not carry delegation');
const reviewer = leasePolicy.workerLeaseForRole('independent_reviewer');
assert.ok(reviewer.includes('genos_adversarial_review'), 'reviewer gets review');
assert.ok(!reviewer.includes('genos_record_decision'), 'reviewer must not carry promotion');
const subOrchestrator = leasePolicy.workerLeaseForRole('sub_orchestrator');
assert.ok(subOrchestrator.includes('genos_delegate_worker'), 'sub-orchestrator keeps subgraph delegation');
assert.ok(!subOrchestrator.includes('genos_change_organization'), 'sub-orchestrator must not carry global topology');
assert.ok(!subOrchestrator.includes('genos_record_decision'), 'sub-orchestrator must not carry promotion');
const orchestrator = leasePolicy.orchestratorCoreLease();
assert.ok(orchestrator.includes('genos_philosophy'), 'orchestrator keeps philosophy');
assert.ok(orchestrator.includes('genos_adversarial_review'), 'orchestrator keeps review');
assert.ok(orchestrator.includes('genos_record_decision'), 'orchestrator keeps decision/provenance');

// 8. Daemon : pas de faux noms d'outils, interface residente bornee.
const daemonTools = daemonGenome.tool_policy.allowed_tools;
assert.ok(!daemonTools.includes('genos_read'), 'daemon must drop obsolete genos_read');
assert.ok(!daemonTools.includes('genos_index'), 'daemon must drop obsolete genos_index');
assert.ok(!daemonTools.includes('genos_signal'), 'daemon must drop bare genos_signal');
assert.ok(!daemonTools.includes('genos_test_safe'), 'daemon must drop absent genos_test_safe');
for (const tool of daemonTools) {
  assert.ok(catalogNames.has(tool), `daemon tool ${tool} must exist in the catalog`);
  assert.ok(registry.isRegisteredTool(tool), `daemon tool ${tool} must have a backend route`);
}
const internal = daemonGenome.tool_policy.internal_runtime;
assert.ok(internal, 'daemon must document its internal_runtime path');
assert.ok(internal.scope_required.includes('daemonId'), 'daemon ops need daemonId scope');
assert.ok(internal.scope_required.includes('territoire'), 'daemon ops need territoire scope');
assert.ok(internal.scope_required.includes('headSha'), 'daemon ops need headSha scope');
assert.ok(internal.forbidden.includes('promotion'), 'daemon must forbid promotion');
assert.ok(daemonGenome.authority.filesystem_write === false, 'daemon must forbid filesystem write');

async function verifyMcpRoutes() {
  const { isToolCallRoutable } = await import('../../mcp/toolCallHandler.js');
  for (const name of matrix.ROUTABLE_TOOLS) {
    assert.ok(catalogNames.has(name), `${name} route must be in the public catalog`);
    assert.ok(mcpNames.has(name), `${name} route must be in the bundled catalog`);
    assert.ok(isToolCallRoutable(name), `${name} must have a real MCP handler`);
    assert.ok(registry.isRegisteredTool(name), `${name} must have a backend route`);
  }
  for (const name of catalogNames) {
    if (!isToolCallRoutable(name)) continue;
    assert.ok(registry.isRegisteredTool(name), `routable catalog tool ${name} needs a backend route`);
  }
  console.log('Lease/catalog coherence checks: PASS');
}

verifyMcpRoutes().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
