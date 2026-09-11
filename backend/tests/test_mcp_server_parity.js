const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const nodeSource = fs.readFileSync(path.join(repositoryRoot, 'mcp', 'index.js'), 'utf8');
const sharedSource = fs.readFileSync(path.join(repositoryRoot, 'shared', 'toolDefinitions.json'), 'utf8');
const rustTools = fs.readFileSync(path.join(repositoryRoot, 'crates', 'genos-mcp', 'src', 'tools.rs'), 'utf8');

for (const tool of ['genos_replay', 'genos_execute_primitive']) {
  assert(nodeSource.includes(`name: "${tool}"`) || sharedSource.includes(`"name": "${tool}"`), `${tool} must be exposed by Node MCP`);
  assert(rustTools.includes(`"name": "${tool}"`), `${tool} must be exposed by Rust MCP`);
}

console.log('MCP server parity checks passed.');