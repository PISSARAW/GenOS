import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BUNDLED_CATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "toolDefinitions.json");

function readTools(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || !Array.isArray(parsed.tools)) {
      console.error(`[GENOS_CATALOG] Invalid catalog shape at ${file}.`);
      return [];
    }
    return parsed.tools;
  } catch (error) {
    console.error(`[GENOS_CATALOG] Corrupt catalog at ${file}: ${error.message}`);
    return [];
  }
}

export function loadToolCatalog(repoRoot) {
  const repoTools = repoRoot ? path.join(repoRoot, "shared", "toolDefinitions.json") : null;
  const primary = repoTools && fs.existsSync(repoTools) ? repoTools : BUNDLED_CATALOG;
  return readTools(primary).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}
