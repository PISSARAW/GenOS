'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ROUTE_PROBE = `import { isToolCallRoutable } from './mcp/toolCallHandler.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const names = require('./shared/toolDefinitions.json').tools.map((tool) => tool.name);
process.stdout.write(JSON.stringify(names.filter(isToolCallRoutable)));`;
let cachedAudit = null;

function audit() {
  if (cachedAudit) return cachedAudit;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', ROUTE_PROBE],
    { cwd: ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true });
  const names = JSON.parse(output);
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')
      || new Set(names).size !== names.length) {
    throw new Error('MCP route probe returned invalid tool identities.');
  }
  cachedAudit = { verified: { names: names.sort() } };
  return cachedAudit;
}

module.exports = { audit };
