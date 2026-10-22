# Run réel LLM — échec de préflight A/E

- Date : 2026-10-22 (UTC d’exécution : 19:52)
- Révision testée : `80f376ac2` (runner corrigé, avant le correctif suivant)
- Modèle déclaré : `qwen2.5:14b`, digest Ollama `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`
- Run : `runtime-ablation-1792698734356.json` (artefact brut ignoré par Git)
- Résultat : ÉCHEC, 2 IDs acceptés puis 2/2 terminés en `error`, 0 rapport worker, 0 événement cognitif, aucun run exploitable.

| Bras | ID d’orchestrateur | Statut | Résultat |
|---|---|---|---|
| A | `mcp_orchestrator_76aada57-9b12-4e06-b8a0-a94e388dd73a` | `error` | aucun rapport, aucun appel modèle attesté |
| E | `mcp_orchestrator_39d3a23f-abf4-48bf-ab94-3d1b28b2b751` | `error` | aucun rapport, aucun appel modèle attesté |

## Cause constatée

Les deux agents ont l’unique événement `REQUEST_ROUTED`; leur `current_task` persistant est `Orchestrator MCP preflight context is incomplete.` Le préflight demande un `workspaceRoot`, mais le payload de `runtime-ablation.cjs` ne le fournissait pas. Ollama a chargé le modèle, mais les agents n’ont pas atteint l’étape LLM. Aucune comparaison A/E ne peut être interprétée.

## Suite

Ajouter le chemin absolu du dépôt comme `workspaceRoot` au payload, collecter l’erreur terminale détaillée par agent, puis relancer la paire.
