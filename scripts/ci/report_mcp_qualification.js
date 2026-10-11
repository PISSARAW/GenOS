'use strict';

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../../shared/toolDefinitions.json').tools;
const codexProfile = require('../../integrations/codex/development-profile.json');
const coherence = require('./check_mcp_coherence');
const { rustServer } = require('./inventory_mcp');

const ROOT = path.resolve(__dirname, '..', '..');
const NATIVE_REFUSALS = Object.freeze({
  genos_merge: { source: 'crates/genos-cli/src/commands/capsule.rs', marker: 'Merge not implemented:' },
  genos_v2_fork: { source: 'crates/genos-cli/src/commands/agent.rs', marker: 'Agent fork not implemented:' }
});

function refusalIsDeclared(name) {
  const refusal = NATIVE_REFUSALS[name];
  if (!refusal) return false;
  return fs.readFileSync(path.join(ROOT, refusal.source), 'utf8').includes(refusal.marker);
}

function offCatalogTransfer() {
  const source = fs.readFileSync(path.join(ROOT,
    'backend/src/services/mcpBioTools/handlers/consciousnessTransfer.js'), 'utf8');
  const probe = 'backend/tests/test_consciousness_transfer.js';
  return { name: 'genos_temporal_consciousness_transfer', publicMcpTool: false,
    declaredAction: source.includes("action: 'execute_transfer'") ? 'execute_transfer' : null,
    classification: source.includes('CLASSIFICATION: reference_only') ? 'reference_only' : 'unclassified',
    domainOutcome: source.includes("status: 'not_implemented'") ? 'not_implemented' : 'not_assessed',
    backendProbe: fs.existsSync(path.join(ROOT, probe)) ? probe : null };
}

function audit() {
  const routed = new Set(coherence.audit().verified.names);
  const leased = new Set(codexProfile.tools);
  const rust = rustServer();
  const rustDeclared = new Set(rust.declaredTools);
  const tools = catalog.map((tool) => ({
    name: tool.name,
    routeVerified: routed.has(tool.name),
    rustAdvertised: rustDeclared.has(tool.name),
    codexDevelopmentLease: leased.has(tool.name),
    nativeStatus: refusalIsDeclared(tool.name) ? 'explicit_refusal' : 'not_assessed',
    domainOutcome: 'not_assessed_by_static_inventory'
  })).sort((left, right) => left.name.localeCompare(right.name));
  return {
    schema: 'genos.mcp-qualification-inventory/v1',
    evidenceBoundary: 'A declared route or lease does not prove a successful domain outcome.',
    summary: { catalogued: tools.length, routed: tools.filter((tool) => tool.routeVerified).length,
      rustAdvertised: tools.filter((tool) => tool.rustAdvertised).length,
      codexLeased: tools.filter((tool) => tool.codexDevelopmentLease).length,
      explicitNativeRefusals: tools.filter((tool) => tool.nativeStatus === 'explicit_refusal').length },
    rustUnavailable: rust.unavailableInRust,
    tools,
    offCatalog: [offCatalogTransfer()]
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(audit(), null, 2)}\n`);

module.exports = { audit };
