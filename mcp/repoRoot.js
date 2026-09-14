import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MARKERS = [
  "Cargo.toml",
  path.join("backend", "package.json"),
  path.join("shared", "toolDefinitions.json")
];

function isRepoRoot(dir) {
  return MARKERS.every((marker) => fs.existsSync(path.join(dir, marker)));
}

function searchUp(startDir) {
  let current = path.resolve(startDir);
  for (;;) {
    if (isRepoRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveRepoRoot() {
  const configured = process.env.GENOS_REPO_ROOT;
  if (configured && fs.existsSync(configured)) return path.resolve(configured);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return searchUp(moduleDir) || searchUp(process.cwd());
}
