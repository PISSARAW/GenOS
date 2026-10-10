import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadToolCatalog } from './catalog.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-catalog-'));
const shared = path.join(root, 'shared');
const catalog = path.join(shared, 'toolDefinitions.json');

try {
  assert.ok(loadToolCatalog(root).length > 0, 'bundled catalog is available when canonical catalog is absent');
  fs.mkdirSync(shared);
  fs.writeFileSync(catalog, '{invalid json');
  assert.deepEqual(loadToolCatalog(root), [], 'corrupt canonical catalog must fail closed');
  fs.writeFileSync(catalog, '{}');
  assert.deepEqual(loadToolCatalog(root), [], 'invalid canonical catalog shape must fail closed');
} finally {
  if (fs.existsSync(catalog)) fs.unlinkSync(catalog);
  if (fs.existsSync(shared)) fs.rmdirSync(shared);
  fs.rmdirSync(root);
}

console.log('MCP canonical catalog fails closed; bundled fallback is used only when absent.');
