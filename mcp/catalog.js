import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BUNDLED_CATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "toolDefinitions.json");

function readTools(file) {
  return JSON.parse(fs.readFileSync(file, "utf8")).tools;
}

export function loadToolCatalog(repoRoot) {
  const repoTools = repoRoot ? path.join(repoRoot, "shared", "toolDefinitions.json") : null;
  const source = repoTools && fs.existsSync(repoTools) ? repoTools : BUNDLED_CATALOG;
  return readTools(source).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}
