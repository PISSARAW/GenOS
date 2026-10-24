'use strict';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; if (input.length > 2_000_000) process.exit(2); });
process.stdin.on('end', async () => {
  try {
    const run = require(process.argv[2]);
    const result = await run(JSON.parse(input));
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(String(error.message || error));
    process.exitCode = 1;
  }
});
