import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadToolCatalog } from "./catalog.js";
import { resolveRepoRoot } from "./repoRoot.js";

const require = createRequire(import.meta.url);
const bundled = require("./contractSchemas.cjs").getToolInputSchema;
const repoRoot = resolveRepoRoot();
const backendContract = repoRoot
  ? path.join(repoRoot, "backend", "src", "services", "mcpContract.js")
  : null;

if (!backendContract || !fs.existsSync(backendContract)) {
  console.log("MCP contract parity skipped: GenOS backend contract not found.");
  process.exit(0);
}

const backend = require(backendContract).getToolInputSchema;
const tools = loadToolCatalog(repoRoot);
for (const tool of tools) {
  const resolved = bundled(tool.name, tool.inputSchema);
  assert.deepEqual(
    resolved,
    backend(tool.name, tool.inputSchema),
    `bundled schema diverges from backend for ${tool.name}`
  );
  assert.deepEqual(
    Object.keys(resolved.properties).sort(),
    Object.keys(tool.inputSchema.properties || {}).sort(),
    `${tool.name} must not advertise unrelated primitive fields`
  );
}
const failures = tools.find((tool) => tool.name === 'genos_search_failures');
const compiled = tools.find((tool) => tool.name === 'genos_compile_memory');
assert.equal(bundled(failures.name, failures.inputSchema).properties.limit.minimum, 1);
assert.equal(bundled(compiled.name, compiled.inputSchema).properties.facts.items.minLength, 1);
console.log(`MCP contract parity passed for ${tools.length} tools.`);
