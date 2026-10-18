import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.resolve(DIRECTORY, '../backend/bin/genos-mcp-actor-bridge.cjs');

export function actorConfigured() {
  return process.env.GENOS_MCP_ACTOR_TOKEN !== undefined;
}

function invoke(arguments_) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BRIDGE, ...arguments_], {
      cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 30000,
      windowsHide: true, maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        const code = String(stderr || '').trim() || error.code || 'MCP_ACTOR_BRIDGE_FAILED';
        reject(Object.assign(new Error(code), { code }));
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch (_) { reject(Object.assign(new Error('MCP_ACTOR_BRIDGE_INVALID'),
        { code: 'MCP_ACTOR_BRIDGE_INVALID' })); }
    });
  });
}

export async function beginActorCall(toolName) {
  if (!actorConfigured()) return null;
  return invoke(['begin', toolName]);
}

export async function finishActorCall(receipt, success, output) {
  if (!receipt) return;
  const outputHash = crypto.createHash('sha256').update(String(output)).digest('hex');
  await invoke(['finish', receipt.toolName, receipt.actionId,
    success ? 'true' : 'false', outputHash]);
}

export function bodyMetadata(receipt) {
  if (!receipt) return { attribution: 'external_unattributed', agentId: null };
  return { attribution: 'agent_bound', agentId: receipt.agentId,
    runId: receipt.runId, actionId: receipt.actionId,
    authorityHash: receipt.authorityHash };
}
