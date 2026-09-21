'use strict';

/**
 * @file playService.js
 * @description Service de jeu (PlaySandbox) pour l'exploration libre.
 *
 * Un agent en mode PLAY peut essayer des combinaisons d'outils et de contextes
 * dans un sandbox sécurisé, sans mission externe immédiate. Les découvertes
 * deviennent des affordances mémorisées pour futures explorations.
 *
 * Utilise les APIs workspaceSnapshotStore.capture() et workspaceSnapshotRun.runInSnapshot()
 * avec leurs signatures réelles.
 */

const crypto = require('crypto');
const { runInSnapshot } = require('./workspaceSnapshotRun');
const { capture } = require('./workspaceSnapshotStore');

const DEFAULT_PLAY_BUDGET = 10;
const DEFAULT_PLAY_TIMEOUT_MS = 30000;

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
    // Signature correcte de capture() : objet avec db, workspace, etc.
    const snapshotPath = await capture({
      db: session.db,
      workspace: { path: workspacePath, id: session.workspaceId },
      label: 'PlaySandbox snapshot',
      reason: 'Play exploration',
      author: session.agentId,
      agentId: session.agentId,
    });
    iteration.snapshotPath = snapshotPath;

    // Signature correcte de runInSnapshot() : objet avec snapshot, command, workspacePath
    const result = await runInSnapshot({
      snapshot: { path: snapshotPath },
      command: input.command,
      timeoutMs: session.timeoutMs,
      workspacePath,
    });

    iteration.result = result;
    // runInSnapshot renvoie exitCode, pas success
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

  // Détection de patterns : "X peut faire Y" ou "X supporte Y"
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

  // Détection de succès d'outil
  if (iteration.outcome === 'success' && iteration.tool) {
    affordances.push({
      capability: iteration.tool,
      verb: 'peut',
      target: iteration.action || 'cette action',
      source: 'successful_execution',
      confidence: 0.7,
    });
  }

  return affordances;
}

// ─── Session de jeu complète ────────────────────────────────────────

async function runPlaySession(agentId, ctx) {
  ctx = ctx || {};
  const workspacePath = ctx.workspacePath;
  const inputs = ctx.inputs || [];
  const session = createPlaySession(agentId, ctx.options);
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

// ─── Play prédéfini : exploration combinatoire ─────────────────────
// Génère des commandes VALIDE selon isAllowedSandboxTestCommand()
// (test runner simple, pas de "explorer X Y" rejeté)

function generateCombinatorialInputs(tools, contexts) {
  const inputs = [];
  const allowedCommands = ['npm test', 'node -e', 'cargo test', 'genos_test'];

  for (const tool of tools) {
    for (const context of contexts) {
      // Utilise des commandes autorisées par le sandbox
      const cmd = allowedCommands[Math.floor(Math.random() * allowedCommands.length)];
      inputs.push({
        action: `${tool}_${context}`,
        tool,
        context,
        command: `${cmd} ${context}`,
      });
    }
  }

  return inputs;
}

module.exports = {
  DEFAULT_PLAY_BUDGET,
  DEFAULT_PLAY_TIMEOUT_MS,
  createPlaySession,
  createPlayIteration,
  executeInSandbox,
  extractAffordances,
  runPlaySession,
  deduplicateAffordances,
  generateCombinatorialInputs,
};
