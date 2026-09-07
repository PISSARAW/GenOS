const assert = require('assert');
const fs = require('fs');

const sources = [
  ['mcp/index.js', 'detached: process.platform !== "win32"'],
  ['backend/src/services/mcpExecutor.js', "detached: process.platform !== 'win32'"],
  ['backend/src/services/genosCli.js', "detached: process.platform !== 'win32'"]
];

for (const [file, marker] of sources) {
  assert(fs.readFileSync(file, 'utf8').includes(marker), `${file} must create a killable process group`);
}
assert(fs.readFileSync('mcp/wrapper.cjs', 'utf8').includes('detached: process.platform !== \'win32\''));
assert(fs.readFileSync('backend/src/services/pluginSandbox.js', 'utf8').includes('terminateChild(child)'));
assert(fs.readFileSync('backend/src/services/pluginSandbox.js', 'utf8').includes("detached: process.platform !== 'win32'"));
assert(fs.readFileSync('backend/src/services/genosCli.js', 'utf8').includes('terminateChild(child)'));

console.log('Process spawn safety checks passed.');
