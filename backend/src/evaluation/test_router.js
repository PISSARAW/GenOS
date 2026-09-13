const { generate } = require('../services/modelRouter');
const { getDatabase } = require('../db');

async function test() {
  const db = await getDatabase();
  console.log('Sending test prompt with priority: interactive...');
  const res = await generate({
    prompt: 'Say hello in one word.',
    model: 'ollama://qwen2.5-coder:7b',
    priority: 'interactive',
    timeoutMs: 60000,
    db
  });
  console.log('Model response:', res.text);
}

test().catch(console.error);
