'use strict';

const readline = require('node:readline');
console.log = console.info = (...args) => console.error(...args);
const { generate } = require('../modelProvider');

async function run() {
  const input = await readRequest();
  try {
    const result = await generate({ model: input.model, endpoint: input.endpoint, prompt: input.prompt, timeoutMs: input.timeoutMs, maxTokens: input.maxTokens, stream: false, enforceSchema: false });
    finish({ provider: input.provider, model: input.model, text: result.text || '', usage: result.usage || {} });
  } catch (error) {
    finish({ provider: input.provider, model: input.model, error: error.message }, 1);
  }
}

function finish(payload, code = 0) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(code));
}

function readRequest() {
  return new Promise((resolve, reject) => {
    let input = '';
    const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    reader.on('line', (line) => { input += line; });
    reader.on('close', () => { try { resolve(JSON.parse(input)); } catch (error) { reject(error); } });
  });
}

run().catch((error) => { process.stderr.write(error.message, () => process.exit(1)); });
