const assert = require('node:assert/strict');
const fs = require('node:fs');

assert.match(fs.readFileSync('mcp/index.js', 'utf8'), /DEFAULT_TOOL_TIMEOUT_MS = 30000/);
assert.match(fs.readFileSync('crates/genos-mcp/src/main.rs', 'utf8'), /DEFAULT_TOOL_TIMEOUT_MS: u64 = 30_000/);
console.log('MCP Node and Rust default timeouts match the backend contract.');