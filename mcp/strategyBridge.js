import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function backendUnavailable() {
  return Promise.resolve({
    configured: false,
    success: false,
    status: "backend_unavailable",
    transport: "strategy_primitive",
    output: {
      success: false,
      error: "GenOS backend is not available for local strategy execution. Install the GenOS repository or set GENOS_REPO_ROOT."
    }
  });
}

function loadBackendStrategy(repoRoot) {
  if (!repoRoot) return null;
  const modulePath = path.join(repoRoot, "backend", "src", "services", "mcpStrategyTools.js");
  if (!fs.existsSync(modulePath)) return null;
  try {
    const mod = require(modulePath);
    return mod && typeof mod.executeStrategyTool === "function" ? mod : null;
  } catch (error) {
    console.error(`[genos-mcp] Strategy backend unavailable: ${error.message}`);
    return null;
  }
}

export function loadStrategyBridge(repoRoot) {
  const backend = loadBackendStrategy(repoRoot);
  if (backend) return { available: true, executeStrategyTool: backend.executeStrategyTool };
  return { available: false, executeStrategyTool: backendUnavailable };
}
