const path = require('path');

const { getDatabase, closeDatabase } = require('../src/db');
const { importDirectory } = require('../src/services/agentDnaStore');

async function main() {
  const directory = process.argv[2] || path.resolve(__dirname, '../../agents/dna');
  const db = await getDatabase();
  const stats = await importDirectory(db, directory, {});
  console.log(JSON.stringify({ success: stats.failed === 0, operation: 'import_agent_dna', directory, ...stats }));
  await closeDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
