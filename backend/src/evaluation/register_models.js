const { getDatabase } = require('../db');

async function main() {
  const db = await getDatabase();
  await db.run(
    `INSERT OR REPLACE INTO provider_configs (id, provider, model, endpoint, enabled, capabilities_json, cost_input, cost_output)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'cfg_ollama_qwen', 'ollama', 'qwen2.5-coder:7b', 'http://127.0.0.1:11434/api/chat', 1, JSON.stringify(['chat']), 0, 0
  );
  await db.run(
    `INSERT OR REPLACE INTO provider_configs (id, provider, model, endpoint, enabled, capabilities_json, cost_input, cost_output)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'cfg_ollama_qwen38', 'ollama', 'qwen3.8:latest', 'http://127.0.0.1:11434/api/chat', 1, JSON.stringify(['chat']), 0, 0
  );
  await db.run(
    `INSERT OR REPLACE INTO provider_configs (id, provider, model, endpoint, enabled, capabilities_json, cost_input, cost_output)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'cfg_ollama_llama31', 'ollama', 'llama3.1:8b', 'http://127.0.0.1:11434/api/chat', 1, JSON.stringify(['chat']), 0, 0
  );
  console.log('Successfully registered Ollama local models in provider_configs table!');
}

main().catch(console.error);
