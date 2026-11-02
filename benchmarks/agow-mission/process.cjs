'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');

function execute(script, input, signal) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [path.join(__dirname, script)],
      { timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true, signal }, (error, stdout) => {
        if (error) { reject(error); return; }
        try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

module.exports = { execute };
