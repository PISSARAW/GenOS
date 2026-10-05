const Database = require('better-sqlite3');
const db = new Database('genos.db');

const projectId = 'onto_dynamic_duo';

// Get the integration path for this project
const integrationPath = 'D:\\DynamicDuo\\.genos\\ontogenesis\\ed3fe9a83acef778cb81f3b1\\integration';

// Update the agent's workspace_id
db.prepare(`
  UPDATE agents SET workspace_id = ? WHERE id LIKE 'onto_run_%'
`).run(integrationPath);

console.log('Agent workspace_id updated');