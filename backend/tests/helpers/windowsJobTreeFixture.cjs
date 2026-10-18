'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

if (process.argv[2] === '--leaf') {
  setInterval(() => {}, 1000);
} else {
  const marker = process.argv[2];
  const leaf = spawn(process.execPath, [__filename, '--leaf'], {
    windowsHide: true, stdio: 'ignore', shell: false
  });
  fs.writeFileSync(marker, JSON.stringify({ rootPid: process.pid, leafPid: leaf.pid,
    inherited: process.env.GENOS_JOB_TEST || null }));
  setInterval(() => {}, 1000);
}
