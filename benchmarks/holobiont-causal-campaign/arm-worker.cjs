'use strict';

const arm = process.argv[2];
const runners = {
  baseline: './baseline-runner.cjs',
  holobiont: './holobiont-runner.cjs'
};

function readInput() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  if (!runners[arm]) throw Object.assign(new Error(`Unknown campaign arm: ${arm}.`), {
    code: 'HOLOBIONT_CAUSAL_ARM_INVALID'
  });
  const input = await readInput();
  const result = await require(runners[arm]).execute(input.testCase, input.repetition);
  process.stdout.write(`${JSON.stringify({ ...result, isolation: {
    kind: 'dedicated-process', pid: process.pid, database: arm === 'holobiont' ? 'sqlite-memory' : null
  } })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.code || 'HOLOBIONT_CAUSAL_WORKER_FAILED'}: ${error.message}\n`);
  process.exitCode = 1;
});
