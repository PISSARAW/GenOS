const assert = require('assert');
const fs = require('fs');

const nodeSource = fs.readFileSync('mcp/index.js', 'utf8');
const rustTools = fs.readFileSync('crates/genos-mcp/src/tools.rs', 'utf8');

for (const tool of ['genos_replay', 'genos_execute_primitive']) {
  assert(nodeSource.includes(`name: "${tool}"`), `${tool} must be exposed by Node MCP`);
  assert(rustTools.includes(`"name": "${tool}"`), `${tool} must be exposed by Rust MCP`);
}

console.log('MCP server parity checks passed.');