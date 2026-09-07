import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const removable = [
  '.genos-matrix',
  'crates/genos-cli/.genos-custom-studio',
  'mcp/mcp-debug.log',
  'genos_server.log'
];
const removeOptions = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 };
const failures = [];

async function removeArtifact(relativePath) {
  try {
    await fs.rm(path.join(repoRoot, relativePath), removeOptions);
  } catch (error) {
    failures.push({ path: relativePath, error: error.code || error.message });
  }
}

async function removePythonCaches(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === '__pycache__') {
      await fs.rm(entryPath, removeOptions).catch((error) => failures.push({ path: path.relative(repoRoot, entryPath), error: error.code || error.message }));
      continue;
    }
    if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== 'target') {
      await removePythonCaches(entryPath);
    }
  }
}

for (const relativePath of removable) {
  await removeArtifact(relativePath);
}
await removePythonCaches(repoRoot);
if (failures.length) {
  console.error(`Some temporary artifacts could not be removed: ${JSON.stringify(failures)}`);
  process.exitCode = 1;
} else {
  console.log('Temporary artifacts removed. Durable .genos snapshots were preserved.');
}
