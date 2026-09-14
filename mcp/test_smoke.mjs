import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const standaloneRoot = mkdtempSync(path.join(os.tmpdir(), "genos-mcp-standalone-"));
const env = { ...process.env, GENOS_REPO_ROOT: standaloneRoot, GENOS_MCP_EXPOSE_ALL: "true" };
delete env.GENOS_MCP_LEASE;
delete env.GENOS_MCP_DISABLED_TOOLS;

function parseLine(line) {
  if (!line.trim()) return null;
  try { return JSON.parse(line); } catch (_) { return null; }
}

function sendJsonRpc(child, request, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timeout waiting for id ${request.id}`)); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      child.removeListener("error", onError);
    }
    function onError(error) { cleanup(); reject(error); }
    function onData(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const payload = parseLine(line);
        if (payload && payload.id === request.id) { cleanup(); resolve(payload); return; }
      }
    }
    child.stdout.on("data", onData);
    child.on("error", onError);
    child.stdin.write(JSON.stringify(request) + "\n");
  });
}

async function main() {
  const child = spawn(process.execPath, [path.join(here, "index.js")], {
    cwd: standaloneRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  try {
    const init = await sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1.0" } }
    });
    assert.equal(init.result.serverInfo.name, "genos-mcp");

    const list = await sendJsonRpc(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const names = list.result.tools.map((tool) => tool.name);
    for (const expected of ["genos_orchestrate", "genos_snapshot", "genos_merge", "genos_audit", "genos_biomimicry"]) {
      assert(names.includes(expected), `standalone tools/list must include ${expected}`);
    }

    const call = await sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "genos_v2_init", arguments: {} }
    });
    assert(Array.isArray(call.result.content), "standalone tools/call must return content");

    console.log("MCP standalone smoke test passed (bundled catalog + schema contract).");
  } finally {
    child.stdin.end();
    child.kill();
    await new Promise((resolve) => child.once("close", resolve));
  }
}

main().catch((error) => {
  console.error("MCP standalone smoke test failed:", error);
  process.exit(1);
});
