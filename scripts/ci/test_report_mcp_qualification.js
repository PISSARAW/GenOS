'use strict';

const assert = require('node:assert/strict');
const catalog = require('../../shared/toolDefinitions.json').tools;
const profile = require('../../integrations/codex/development-profile.json');
const { audit } = require('./report_mcp_qualification');

const report = audit();
assert.equal(report.summary.catalogued, catalog.length);
assert.deepEqual(report.tools.map((tool) => tool.name), catalog.map((tool) => tool.name).sort());
assert.equal(report.summary.routed, catalog.length);
assert.equal(report.summary.rustAdvertised, catalog.length - report.rustUnavailable.length);
assert.deepEqual(report.rustUnavailable,
  ['genos_browser_act', 'genos_computer_use', 'genos_foveal_crop', 'genos_optimal_foraging']);
assert.equal(report.summary.codexLeased, profile.tools.length);
assert.deepEqual(report.tools.filter((tool) => tool.nativeStatus === 'explicit_refusal').map((tool) => tool.name),
  ['genos_merge', 'genos_v2_fork']);
assert.ok(report.tools.every((tool) => tool.domainOutcome === 'not_assessed_by_static_inventory'));
assert.equal(report.offCatalog[0].publicMcpTool, false);
assert.equal(report.offCatalog[0].declaredAction, 'execute_transfer');
assert.equal(report.offCatalog[0].classification, 'reference_only');
assert.equal(report.offCatalog[0].domainOutcome, 'not_implemented');
assert.ok(report.offCatalog[0].backendProbe);
console.log(`MCP qualification inventory distinguishes ${report.summary.catalogued} routes from domain proof.`);
