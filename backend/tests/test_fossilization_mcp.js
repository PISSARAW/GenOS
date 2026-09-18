const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GENOS_FOSSIL_ARTIFACT = '0';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'fossilization-mcp-suite-only';

const dbService = require('../src/db');
const { executeConfiguredTransport } = require('../src/services/mcpExecutor/dispatch');

async function run() {
  const dbPath = path.join(os.tmpdir(), `genos_fossil_mcp_${Date.now()}.db`);
  process.env.GENOS_DB_PATH = dbPath;
  try {
    const created = await executeConfiguredTransport({
      toolName: 'genos_fossil_record',
      args: { lineage_id: 'mcp_lineage', reason: 'MCP test', mode: 'trace', organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(created.success, JSON.stringify(created));
    const fossilId = created.output.fossil.fossil_id;

    const listed = await executeConfiguredTransport({
      toolName: 'genos_fossil_list',
      args: { organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(listed.success && listed.output.fossils.some((fossil) => fossil.fossil_id === fossilId));

    const excavated = await executeConfiguredTransport({
      toolName: 'genos_fossil_excavate',
      args: { fossil_id: fossilId, organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(excavated.success && excavated.output.read_only && excavated.output.resurrection === 'forbidden');
    console.log('MCP fossilization dispatch passed.');
  } finally {
    await dbService.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  }
}

run().catch((error) => {
  console.error('MCP fossilization failure:', error);
  process.exit(1);
});
