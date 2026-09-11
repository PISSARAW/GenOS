const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
assert.match(fs.readFileSync(path.join(repoRoot, 'mcp/index.js'), 'utf8'), /DEFAULT_TOOL_TIMEOUT_MS = 30000/);
const rustSource = fs.existsSync(path.join(repoRoot, 'crates/genos-mcp/src/executor.rs'))
  ? fs.readFileSync(path.join(repoRoot, 'crates/genos-mcp/src/executor.rs'), 'utf8')
  : fs.readFileSync(path.join(repoRoot, 'crates/genos-mcp/src/main.rs'), 'utf8');
assert.match(rustSource, /DEFAULT_TOOL_TIMEOUT_MS: u64 = 30_000/);
console.log('MCP Node and Rust default timeouts match the backend contract.');