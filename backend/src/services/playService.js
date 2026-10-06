'use strict';

/**
 * @file playService.js
 * @description PlaySandbox — exploration libre dans un sandbox.
 *
 * Correction P0 : utilise correctement les APIs de snapshot.
 * - capture() retourne { id, workspaceId, snapshotHash, metadata, snapshotPath }
 * - runInSnapshot() attend { snapshot: { path, ... }, command, timeoutMs, workspacePath }
 * - Seules les commandes autorisées par sandboxCommandPolicy sont utilisées
 */

const crypto = require('crypto');
const { runInSnapshot } = require('./workspaceSnapshotRun');
const { capture, readManifest } = require('./workspaceSnapshotStore');

const DEFAULT_PLAY_BUDGET = 10;
const DEFAULT_PLAY_TIMEOUT_MS = 30000;

// Commandes réellement autorisées par sandboxCommandPolicy.js
const ALLOWED_SANDBOX_COMMANDS = ['npm test', 'npm run check', 'pytest', 'cargo test'];

function boundedInteger(value, fallback, maximum) {
  const number = value ?? fallback;
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) throw new Error('Invalid Play budget');
  return number;
}

// ─── Session de jeu ─────────────────────────────────────────────────

function createPlaySession(agentId, options) {
  options = options || {};
  const id = `play_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    agentId,
    budget: boundedInteger(options.budget, DEFAULT_PLAY_BUDGET, 1000),
    timeoutMs: boundedInteger(options.timeoutMs, DEFAULT_PLAY_TIMEOUT_MS, 300000),
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,
    iterations: [],
    discoveries: [],
    db: options.db || null,
    workspaceId: options.workspaceId || null,
    constraints: {
      // Sandbox exigé par défaut; aucun chemin d'exécution hors sandbox
      // n'existe: une désactivation explicite bloque au lieu d'exécuter.
      requireSandbox: options.requireSandbox !== false,
      allowNetwork: options.allowNetwork === true,
      allowFileSystem: options.allowFileSystem !== false,
      maxToolInvocations: boundedInteger(options.maxToolInvocations, 20, 1000),
      maxSnapshotSizeBytes: boundedInteger(options.maxSnapshotSizeBytes, 10 * 1024 * 1024, 100 * 1024 * 1024),
    },
  };
}

// ─── Itération de jeu ───────────────────────────────────────────────

function createPlayIteration(iterationIndex, input) {
  return {
    index: iterationIndex,
    timestamp: new Date().toISOString(),
    action: input.action,
    tool: input.tool,
    context: input.context,
    result: null,
    outcome: null,
    observation: null,
    affordancesDiscovered: [],
  };
}

// ─── Exécution dans le sandbox ──────────────────────────────────────

async function executeInSandbox(session, input, workspacePath) {
  const iteration = createPlayIteration(session.iterations.length, input);

  // Fail-closed: sans sandbox exigé et actif, on bloque au lieu d'exécuter.
  if (!session || !session.constraints || session.constraints.requireSandbox !== true) {
    iteration.outcome = 'blocked';
    iteration.observation = 'Play execution blocked: requireSandbox must be true.';
    return iteration;
  }

  try {
    // 1. Capture : retourne { id, workspaceId, snapshotHash, metadata, snapshotPath }
    const snapshot = await capture({
      db: session.db,
      workspace: workspacePath ? { path: workspacePath, id: session.workspaceId } : undefined,
      label: 'PlaySandbox snapshot',
      reason: 'Play exploration',
      author: session.agentId,
      agentId: session.agentId,
    });

    iteration.snapshotId = snapshot?.id;
    await validateSnapshotBudget(snapshot, session.constraints.maxSnapshotSizeBytes);

    // 2. runInSnapshot : utilise storagePath du résultat de capture()
    const snapshotPath = snapshot?.metadata?.storagePath;
    if (!snapshotPath) {
      iteration.outcome = 'error';
      iteration.observation = 'Play capture returned no storagePath';
      return iteration;
    }
    const result = await runInSnapshot({
      snapshot: { id: snapshot?.id, snapshot_hash: snapshot?.snapshotHash, metadata: snapshot?.metadata },
      command: input.command,
      timeoutMs: session.timeoutMs,
      workspacePath,
    });

    iteration.result = result;
    iteration.outcome = result.exitCode === 0 ? 'success' : 'failure';
    iteration.observation = result.stdout || result.stderr || '';
  } catch (err) {
    iteration.outcome = 'error';
    iteration.observation = err.message;
  }

  return iteration;
}

async function validateSnapshotBudget(snapshot, limit) {
  const manifest = await readManifest({ ...snapshot, snapshot_hash: snapshot.snapshotHash });
  const size = manifest.files.reduce((sum, file) => sum + file.size, 0);
  if (size > limit) throw new Error('Play snapshot exceeds byte budget');
}

// ─── Découverte d'affordances ───────────────────────────────────────

function extractAffordances(iteration) {
  if (iteration.outcome !== 'success' || !iteration.snapshotId || iteration.result?.exitCode !== 0) return [];
  const affordances = [];
  const observation = iteration.observation || '';

  // Pattern : "X peut faire Y" ou "X supporte Y"
  const peutPattern = /(\w[\w \t]{2,30})[ \t]+(peut|supporte|permet|offre)[ \t]+(\w[\w \t]{2,50})/gi;
  let match;

  while ((match = peutPattern.exec(observation)) !== null) {
    affordances.push({
      capability: match[1].trim(),
      verb: match[2].trim(),
      target: match[3].trim(),
      source: 'successful-command-output',
      confidence: 0.25,
      verified: false,
    });
  }

  // NOTE: Pas d'affordance basée sur iteration.tool — une commande shell
  // générique (npm test, pytest) ne prouve pas que le tool a été invoqué.
  // L'affordance nécessite une preuve d'usage réel (exécution tracée du tool).

  return affordances;
}

// ─── Session complète ───────────────────────────────────────────────

async function runPlaySession(agentId, ctx) {
  ctx = ctx || {};
  const workspacePath = ctx.workspacePath;
  const inputs = ctx.inputs || [];
  const session = createPlaySession(agentId, {
    ...ctx.options,
    db: ctx.db,
    workspaceId: ctx.workspaceId,
  });
  const discoveries = [];

  for (const input of inputs) {
    if (session.budget <= 0) break;
    if (session.iterations.length >= session.constraints.maxToolInvocations) break;
    if (session.status !== 'active') break;

    const iteration = await executeInSandbox(session, input, workspacePath);
    session.iterations.push(iteration);
    session.budget -= 1;

    const affordances = extractAffordances(iteration);
    iteration.affordancesDiscovered = affordances;
    discoveries.push(...affordances);
  }

  session.dedupedDiscoveries = deduplicateAffordances(discoveries);
  session.discoveries = discoveries;
  if (session.db?.run) await persistPlayObservations(session);
  session.status = 'completed';
  session.endedAt = new Date().toISOString();

  return session;
}

async function persistPlayObservations(session) {
  for (const iteration of session.iterations) {
    for (const item of iteration.affordancesDiscovered) {
      const id = crypto.createHash('sha256').update(JSON.stringify({
        agentId: session.agentId, snapshotId: iteration.snapshotId,
        command: iteration.result?.command, item,
      })).digest('hex');
      await session.db.run(
        `INSERT OR IGNORE INTO nce_play_observations
         (id, agent_id, snapshot_id, command, observation_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id, session.agentId, iteration.snapshotId, iteration.result?.command || '',
        JSON.stringify(item), iteration.timestamp
      );
    }
  }
}

function deduplicateAffordances(discoveries) {
  const seen = new Map();
  for (const d of discoveries) {
    const key = `${d.capability}|${d.verb}|${d.target}`;
    const existing = seen.get(key);
    if (!existing || d.confidence > existing.confidence) {
      seen.set(key, d);
    }
  }
  return Array.from(seen.values());
}

// ─── Génération combinatoire de commandes valides ───────────────────

function generateCombinatorialInputs(tools, contexts, seed = 'nce-v1') {
  const inputs = [];

  for (const tool of tools) {
    for (const context of contexts) {
      // Sélectionne une commande autorisée
      const digest = crypto.createHash('sha256').update(`${seed}:${tool}:${context}`).digest();
      const cmd = ALLOWED_SANDBOX_COMMANDS[digest.readUInt32BE(0) % ALLOWED_SANDBOX_COMMANDS.length];
      inputs.push({
        action: `${tool}_${context}`,
        tool,
        context,
        // La commande doit être exacte (sans suffixe de contexte qui la rendrait invalide)
        command: cmd,
      });
    }
  }

  return inputs;
}

module.exports = {
  DEFAULT_PLAY_BUDGET,
  DEFAULT_PLAY_TIMEOUT_MS,
  ALLOWED_SANDBOX_COMMANDS,
  createPlaySession,
  createPlayIteration,
  executeInSandbox,
  extractAffordances,
  runPlaySession,
  deduplicateAffordances,
  generateCombinatorialInputs,
};
