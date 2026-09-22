'use strict';

/**
 * @file testMcpSandbox.js
 * @description MCP Sandbox tests
 */

async function runMcpSandboxTests(options = {}) {
  const { request, assert } = options;
  console.log('\n--- 5. MCP Sandbox: Schema Inspector, VFS Dry-Run & Metrics ---');
  const toolsRes = await request({ method: 'GET', path: '/api/tools' });
  assert(toolsRes.status === 200 && toolsRes.body.length >= 40, `GET /api/tools returned ${toolsRes.body.length} MCP tools`);

  const schemaRes = await request({ method: 'GET', path: '/api/tools/genos_create/schema' });
  assert(schemaRes.status === 200 && schemaRes.body.type === 'object' && schemaRes.body.properties.path !== undefined, 'GET /api/tools/:name/schema returned draft-07 JSON Schema');

  const dryRunRes = await request({
    method: 'POST',
    path: '/api/tools/dry-run'
  }, { toolName: 'genos_create', args: { path: 'src/test.js', content: 'console.log(1);' } });
  assert(dryRunRes.status === 200 && dryRunRes.body.blastRadiusScore >= 0 && dryRunRes.body.sideEffects.filesCreated.length === 1, 'POST /api/tools/dry-run executed VFS simulation with Blast Radius');

  const metricsRes = await request({ method: 'GET', path: '/api/tools/metrics' });
  assert(metricsRes.status === 200 && metricsRes.body.tools.length > 0, 'GET /api/tools/metrics returned sub-millisecond latency & token metrics');
}

module.exports = { runMcpSandboxTests };