# Run réel LLM — MCP bootstrap bloqué par puppeteer manquant

- Date : 2026-10-22 (UTC : 20:03)
- Révision : `a3a5afa1b` avec SDK MCP et CLI Rust compilé sur D:
- Modèle : Ollama `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`
- Rapport runner : `runtime-ablation-1792699424623.json` (artefact brut sous results/).
- Résultat : ÉCHEC, 2/2 missions finies en erreur, aucun worker, aucun rapport et aucun événement cognitif.

| Bras | ID | Erreur terminale |
|---|---|---|
| A | `mcp_orchestrator_f8d68e87-b935-4ae7-a27f-71a361b55638` | `MCP error -32000: Connection closed` |
| E | `mcp_orchestrator_32ed789b-dfba-4afe-a18a-23e826b16139` | `MCP error -32000: Connection closed` |

Les stderr MCP joints montrent la cause : l’import de `mcpToolRegistry.js` charge `browserScoutService`, qui construit `BrowserPuppeteerAdapter`; celui-ci fait immédiatement `require('puppeteer')`. Le paquet `puppeteer` est déclaré dans le `package.json` et lockfile racine, mais le worktree n’a pas de `node_modules` racine. Seules les dépendances backend et MCP avaient été installées.

Ollama a bien servi le modèle au préchauffage, mais le préflight GenOS a planté avant tout appel agent. Le résultat n’est pas une expérience comportementale.

## Suite

Installer les dépendances racine verrouillées (`npm ci` à la racine, cache sur D:), vérifier le module Puppeteer, puis retenter la paire.
