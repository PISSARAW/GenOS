import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function bundledResolver() {
  return require("./contractSchemas.cjs").getToolInputSchema;
}

export function loadToolSchemaResolver(repoRoot) {
  if (repoRoot) {
    const backendContract = path.join(repoRoot, "backend", "src", "services", "mcpContract.js");
    if (fs.existsSync(backendContract)) {
      try {
        return require(backendContract).getToolInputSchema;
      } catch (error) {
        console.error(`[genos-mcp] Falling back to bundled schema contract: ${error.message}`);
      }
    }
  }
  return bundledResolver();
}
