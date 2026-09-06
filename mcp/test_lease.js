import assert from "node:assert/strict";
import { filterLeasedTools, toolIsLeased } from "./lease.js";

const tools = [{ name: "genos_orchestrate" }, { name: "genos_snapshot" }];
assert.deepEqual(
  filterLeasedTools(tools, { GENOS_MCP_LEASE: "genos_snapshot" }).map((tool) => tool.name),
  ["genos_snapshot"]
);
assert.equal(toolIsLeased("genos_orchestrate", tools, { GENOS_MCP_LEASE: "genos_snapshot" }), false);
assert.equal(toolIsLeased("genos_snapshot", tools, { GENOS_MCP_LEASE: "genos_snapshot" }), true);
assert.equal(toolIsLeased("genos_snapshot", tools, { GENOS_MCP_EXPOSE_ALL: "true" }), true);
assert.deepEqual(
  filterLeasedTools(tools, { GENOS_MCP_LEASE: "snapshot", GENOS_MCP_EXPOSE_ALL: "true" }).map((tool) => tool.name),
  ["genos_orchestrate", "genos_snapshot"]
);
assert.equal(toolIsLeased("genos_snapshot", tools, { GENOS_MCP_LEASE: "snapshot" }), true);
console.log("MCP lease checks passed.");
