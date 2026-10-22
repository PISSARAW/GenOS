# Run réel LLM — dépendance MCP absente

- Date : 2026-10-22 (UTC d’exécution : 19:53)
- Révision testée : `8c5838b00`
- Runner : `runtime-ablation-1792698806266.json` (résultat brut sous `results/`, ignoré par Git)
- Modèle local Ollama : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`
- Résultat : ÉCHEC, 2/2 orchestrateurs terminés en erreur avant dispatch, 0 rapports, 0 événement cognitif.

| Bras | ID d’orchestrateur | Cause persistée |
|---|---|---|
| A | `mcp_orchestrator_b273dc04-6236-4fb5-9126-62042b4b17af` | module SDK MCP introuvable sous `mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js` |
| E | `mcp_orchestrator_6ddd28e0-2fd8-40ff-b319-5367b4171ca9` | même erreur SDK MCP |

Le `workspaceRoot` est désormais transmis; le préflight progresse jusqu’à la connexion MCP et bute sur l’absence des dépendances du package MCP. Le modèle a été chargé, mais aucun agent n’a appelé le modèle. Aucune mesure A/E n’est valide.

## Suite

Installer les dépendances verrouillées du package `mcp` sur D: avec son lockfile, vérifier le module SDK présent, puis relancer la même paire.
