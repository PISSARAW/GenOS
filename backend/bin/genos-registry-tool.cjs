#!/usr/bin/env node
/**
 * CLI bridge: procedural registry admin tool (read/write/runners/evaluators/
 * environments/snapshots) exposed through the GenOS orchestration bridge so
 * that remote agents / MCP clients can resolve runnerId/evaluatorId/etc.
 * without transporting JavaScript functions.
 *
 * Usage (internal, from genos-orchestrate.cjs):
 *   node backend/bin/genos-registry-tool.cjs <command> <json-payload>
 *
 * Commands:
 *   list-runners
 *   list-evaluators
 *   list-environments
 *   list-snapshots
 *   register-runner  { "id": "...", "runner": "<base64 encoded function source>" }  // registre serveur seulement, jamais depuis un client non-trusté
 *   register-evaluator { "id": "...", "evaluator": "<base64 encoded function source>" }
 *   unregister-runner  { "id": "..." }
 *   unregister-evaluator { "id": "..." }
 *   resolve-runner { "id": "..." }         -> returns { ok, id, runnerKind }  (pas le code)
 *   resolve-evaluator { "id": "..." }      -> returns { ok, id, evaluatorKind }
 *
 * Sécurité : le registre n'accepte jamais de code frais depuis l'extérieur du
 * processus de confiance (orchestrateur / backend). Les IDs sont sérialisables,
 * les fonctions sont résolues côté serveur seulement.
 */

'use strict';

const path = require('path');

// Le registre est un module côté backend; on le résout depuis la racine du repo.
let registry;
try {
  registry = require('../src/services/proceduralRegistryService');
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: 'proceduralRegistryService not reachable', detail: e.message }));
  process.exit(1);
}

function run(command, params = {}) {
  const payload = { ...params, command };
  const commands = {
    'list-runners': () => ({ ok: true, items: registry.listRunners() }),
    'list-evaluators': () => ({ ok: true, items: registry.listEvaluators() }),
    'list-environments': () => ({ ok: true, items: registry.listEnvironments() }),
    'list-snapshots': () => ({ ok: true, items: registry.listSnapshots() }),
    'register-runner': () => registry.registerRunner(payload.id, payload.runner)
      ? { ok: true, registered: true, id: payload.id }
      : { ok: false, error: 'failed to register runner' },
    'register-evaluator': () => registry.registerEvaluator(payload.id, payload.evaluator)
      ? { ok: true, registered: true, id: payload.id }
      : { ok: false, error: 'failed to register evaluator' },
    'unregister-runner': () => ({ ok: true, unregistered: registry.unregisterRunner(payload.id), id: payload.id }),
    'unregister-evaluator': () => ({ ok: true, unregistered: registry.unregisterEvaluator(payload.id), id: payload.id }),
    'resolve-runner': () => {
      try {
        const r = registry.resolveRunner(payload.id);
        return { ok: true, id: payload.id, runnerKind: typeof r };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    'resolve-evaluator': () => {
      try {
        const e = registry.resolveEvaluator(payload.id);
        return { ok: true, id: payload.id, evaluatorKind: typeof e };
      } catch (e) { return { ok: false, error: e.message }; }
    },
  };
  return commands[command] ? commands[command]() : { ok: false, error: `unknown command: ${command}` };
}

// CLI mode: node genos-registry-tool.cjs <command> <json-payload>
if (require.main === module) {
  const raw = process.argv[2];
  const payload = raw ? JSON.parse(raw) : {};
  const result = run(process.argv[3] || payload.command, payload);
  if (result.ok) {
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
}

module.exports = { run };
