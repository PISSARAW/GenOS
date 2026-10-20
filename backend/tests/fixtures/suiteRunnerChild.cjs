'use strict';

const mode = process.argv[2];

if (mode === 'pass') {
  process.stdout.write('complete output\n');
} else if (mode === 'fail') {
  process.stdout.write('partial stdout\n');
  process.stderr.write('failure detail\n');
  process.exitCode = 7;
} else if (mode === 'timeout') {
  process.stdout.write('partial before timeout\n');
  setInterval(() => {}, 1000);
} else {
  process.stderr.write(`unknown fixture mode: ${mode}\n`);
  process.exitCode = 2;
}
