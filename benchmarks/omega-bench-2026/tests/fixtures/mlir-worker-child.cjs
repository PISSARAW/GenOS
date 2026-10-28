'use strict';

const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });

input.on('line', (line) => {
  const request = JSON.parse(line);
  process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, latency_ms: 0.25,
    output_bytes: Buffer.byteLength(request.source), optimized_ir_sha256: 'a'.repeat(64) })}\n`);
});

input.on('close', () => process.exit(0));
