'use strict';

const readline = require('node:readline');
const { generate } = require('../modelProvider');

async function run() {
  const input = await readRequest();
  try {
    const result = await generate({ model: input.model, endpoint: input.endpoint, prompt: input.prompt, timeoutMs: input.timeoutMs, maxTokens: input.maxTokens, stream: false, enforceSchema: false });
    process.stdout.write(JSON.stringify({ provider: input.provider, model: input.model, text: result.text || '', usage: result.usage || {} }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ provider: input.provider, model: input.model, error: error.message }));
    process.exitCode = 1;
  }
}

function readRequest() {
  return new Promise((resolve, reject) => {
    let input = '';
    const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    reader.on('line', (line) => { input += line; });
    reader.on('close', () => { try { resolve(JSON.parse(input)); } catch (error) { reject(error); } });
  });
}

run().catch((error) => { process.stderr.write(error.message); process.exitCode = 1; });
