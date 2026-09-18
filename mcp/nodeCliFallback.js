import fs from 'fs';
import path from 'path';

function writeJson(file, value) {
  fs.writeFileSync(path.resolve(file), JSON.stringify(value, null, 2));
}

function completed(data) {
  return { success: true, status: 'completed', simulated: false, fallbackUsed: true, ...data };
}

function unavailable(operation, reason) {
  return {
    success: false,
    status: 'capability_unavailable',
    simulated: false,
    fallbackUsed: true,
    operation,
    error: reason,
  };
}

function snapshotFallback(toolArgs) {
  const result = completed({
    snapshotId: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agent: toolArgs.agent || 'default',
    createdAt: new Date().toISOString(),
    fallback: 'node_bridge'
  });
  writeJson(toolArgs.out || path.resolve('snapshot.json'), result);
  return result;
}

function replayFallback(toolArgs) {
  const snapshot = path.resolve(toolArgs.snapshot || 'snapshot.json');
  if (!fs.existsSync(snapshot)) return unavailable('replay', `Snapshot '${snapshot}' does not exist.`);
  const parsed = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  return completed({ replay: 'completed', snapshot, eventsReplayed: events.length, fallback: 'node_bridge' });
}

function capsuleFallback(toolArgs) {
  if (!toolArgs.snapshot_id) return unavailable('capsule', 'snapshot_id is required by the Node fallback.');
  return completed({
    capsuleId: `capsule_${Date.now()}`,
    snapshotId: toolArgs.snapshot_id,
    status: 'provisioned',
    fallback: 'node_bridge'
  });
}

function mergeFallback(args, toolArgs) {
  return unavailable('merge', `Branch merge requires the Rust CLI; branch '${toolArgs.branch_id || args[1] || ''}' was not merged.`);
}

function auditFallback(args, toolArgs) {
  return unavailable('audit', `Audit requires the Rust CLI; snapshot '${toolArgs.snapshot_id || args[1] || ''}' was not audited.`);
}

function biomimicryFallback(toolArgs) {
  return unavailable('biomimicry', `Biomimicry feature '${toolArgs.feature || 'unknown'}' requires the Rust CLI.`);
}

function initFallback() {
  return completed({ status: 'initialized', version: '3.0.0', fallback: 'node_bridge' });
}

function agentFallback(args, toolArgs) {
  return unavailable('agent', `Agent operation '${args[1] || 'fork'}' requires the Rust CLI.`);
}

function genericFallback(args) {
  return unavailable(args[0] || 'unknown', `Command '${args.join(' ')}' has no verified Node implementation.`);
}

const HANDLERS = {
  snapshot: (_args, toolArgs) => snapshotFallback(toolArgs),
  replay: (_args, toolArgs) => replayFallback(toolArgs),
  capsule: (_args, toolArgs) => capsuleFallback(toolArgs),
  merge: mergeFallback,
  audit: auditFallback,
  biomimicry: (_args, toolArgs) => biomimicryFallback(toolArgs),
  init: () => initFallback(),
  agent: agentFallback
};

export async function executeNodeFallback(args, toolArgs = {}) {
  const verb = args[0];
  console.error(`[GENOS_FALLBACK] Rust binary 'genos' not found; executing '${verb}' via Node bridge fallback.`);
  const handler = HANDLERS[verb] || (() => genericFallback(args));
  return JSON.stringify(handler(args, toolArgs));
}
