const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GENOS_FOSSIL_ARTIFACT = '0';
process.env.GENOS_AGENT_DNA = '1';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'fossilization-mcp-suite-only';

const dbService = require('../src/db');
const dnaStore = require('../src/services/agentDnaStore');
const { executeConfiguredTransport } = require('../src/services/mcpExecutor/dispatch');

async function run() {
  const dbPath = path.join(os.tmpdir(), `genos_fossil_mcp_${Date.now()}.db`);
  process.env.GENOS_DB_PATH = dbPath;
  try {
    const created = await executeConfiguredTransport({
      toolName: 'genos_fossil_record',
      args: { lineage_id: 'mcp_lineage', reason: 'MCP test', mode: 'trace', hard_parts: ['genos_sandbox_exec'], organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(created.success, JSON.stringify(created));
    const fossilId = created.output.fossil.fossil_id;

    const listed = await executeConfiguredTransport({
      toolName: 'genos_fossil_list',
      args: { organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(listed.success && listed.output.fossils.some((fossil) => fossil.fossil_id === fossilId));
    assert(listed.output.fossils.find((fossil) => fossil.fossil_id === fossilId).hard_parts.includes('genos_sandbox_exec'));

    const strata = await executeConfiguredTransport({
      toolName: 'genos_fossil_strata', args: { organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(strata.success && strata.output.strata.some((stratum) => stratum.fossil_count > 0));

    const excavated = await executeConfiguredTransport({
      toolName: 'genos_fossil_excavate',
      args: { fossil_id: fossilId, organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(excavated.success && excavated.output.read_only && excavated.output.resurrection === 'forbidden');

    const decoded = await executeConfiguredTransport({
      toolName: 'genos_fossil_decode', args: { fossil_id: fossilId, organization_id: 'org-1', project_id: 'project-1' }
    });
    assert(decoded.success && decoded.output.read_only && decoded.output.fossil_id === fossilId);

    const unavailable = await executeConfiguredTransport({
      toolName: 'genos_fossil_candidate', args: { fossil_id: fossilId, organization_id: 'org-1', project_id: 'project-1' }
    });
    assert.equal(unavailable.success, false);
    assert.equal(unavailable.status, 'capability_unavailable', JSON.stringify(unavailable));

    const db = await dbService.getDatabase();
    await dnaStore.importDirectory(db, path.resolve(__dirname, '../../agents/dna/fondations'), {});
    const candidate = await executeConfiguredTransport({
      toolName: 'genos_fossil_candidate',
      args: { fossil_id: fossilId, base_genome_ref: 'EvidenceLedger', organization_id: 'org-1', project_id: 'project-1' }
    });
    assert.equal(candidate.success, true, JSON.stringify(candidate));
    assert.equal(candidate.status, 'candidate');
    assert.ok(candidate.output.candidateGenomeRef);
    const genome = await db.get('SELECT status FROM agent_genomes WHERE id = ?', candidate.output.candidateGenomeRef);
    assert.equal(genome.status, 'candidate');
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
