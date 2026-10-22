# Run réel LLM — MCP se ferme avant l’exécution

- Date : 2026-10-22 (UTC : 19:55)
- Révision : `8c5838b00` avec dépendances MCP installées localement sur D:
- Résultat brut : `runtime-ablation-1792698910661.json` (runner indiquait 2/2 terminées, mais ce verdict est erroné).
- Modèle disponible dans Ollama : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.

| Bras | ID d’orchestrateur | Statut capturé | Rapports | Événements cognitifs |
|---|---|---:|---:|---:|
| A | `mcp_orchestrator_707a3a73-b524-45e9-b79c-6e82d7b9838a` | `idle` | 0 | 0 |
| E | `mcp_orchestrator_fb2eb078-15b3-4681-8c7a-2d26623a3146` | `idle` | 0 | 0 |

## Erreur observée

Les deux processus détachés ont écrit `McpError: MCP error -32000: Connection closed` dans les journaux bruts joints. Aucun rapport de génération ni usage de modèle n’est enregistré dans la base GenOS. Le chargement du modèle Ollama seul ne démontre pas l’exécution d’un agent.

## Défaut découvert dans le runner

`runtime-ablation.cjs` comptait `idle` comme un état terminal. Il a donc déclaré 2/2 terminées immédiatement, alors que l’état `idle` seul n’est pas terminal selon `backend/src/services/orchestratorMissionStatus.js` (il faut un statut de run terminal). Le résultat de ce run est invalide et ne doit pas servir comme succès.

## Suite

Corriger l’attente pour suivre le `detachedProcessId`/PID renvoyé par l’orchestrateur et attendre la suppression attestée de `detached_processes`. Construire le CLI Rust absent dans ce worktree et conserver le stderr de préflight MCP afin d’obtenir la cause primaire de la fermeture.
