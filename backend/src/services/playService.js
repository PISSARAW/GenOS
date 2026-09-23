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

// ─── Session de jeu ─────────────────────────────────────────────────

function createPlaySession(agentId, options) {
  options = options || {};
  const id = `play_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    agentId,
    budget: options.budget || DEFAULT_PLAY_BUDGET,
    timeoutMs: options.timeoutMs || DEFAULT_PLAY_TIMEOUT_MS,
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,
    iterations: [],
    discoveries: [],
    db: options.db || null,
    workspaceId: options.workspaceId || null,
    constraints: {
      requireSandbox: options.requireSandbox !== false,
      allowNetwork: options.allowNetwork === true,
      allowFileSystem: options.allowFileSystem !== false,
      maxToolInvocations: options.maxToolInvocations || 20,
      maxSnapshotSizeBytes: options.maxSnapshotSizeBytes || 10 * 1024 * 1024,
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

// ─── Découverte d'affordances ───────────────────────────────────────

function extractAffordances(iteration) {
  const affordances = [];
  const observation = iteration.observation || '';

  // Pattern : "X peut faire Y" ou "X supporte Y"
  const peutPattern = /(\w[\w\s]{2,30})\s+(peut|supporte|permet|offre)\s+(\w[\w\s]{2,50})/gi;
  let match;

  while ((match = peutPattern.exec(observation)) !== null) {
    affordances.push({
      capability: match[1].trim(),
      verb: match[2].trim(),
      target: match[3].trim(),
      source: 'observation',
      confidence: 0.5,
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
  session.status = session.budget <= 0 ? 'completed' : 'active';
  session.endedAt = new Date().toISOString();

  return session;
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

function generateCombinatorialInputs(tools, contexts) {
  const inputs = [];

  for (const tool of tools) {
    for (const context of contexts) {
      // Sélectionne une commande autorisée
      const cmd = ALLOWED_SANDBOX_COMMANDS[Math.floor(Math.random() * ALLOWED_SANDBOX_COMMANDS.length)];
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
