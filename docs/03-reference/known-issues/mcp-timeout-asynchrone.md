## Timeout MCP pour outils asynchrones

Les outils MCP qui déclenchent des missions asynchrones longues (`genos_orchestrate`, `genos_biological_mode`, `genos_delegate_worker`) peuvent
timeouter à 30s côté CLIENT HERMES MCP. Le serveur GenOS applique lui aussi un timeout court : `DEFAULT_TOOL_TIMEOUT_MS = 30000ms = 30s` (`mcp/index.js:30`).

Cause : le bridge MCP client Hermes impose un timeout de 30s sur les appels d'outils. Les outils asynchrones qui attendent la fin de la mission
dépassent ce budget.

Mitigation :
- `background: true` est désormais le défaut pour `genos_orchestrate` et `genos_delegate_worker` (`mcp/toolCallHandler.js`, `mcpContract.js`, `shared/toolDefinitions.json`) : un appel sans `background` retourne un reçu d'acceptation immédiat sans attendre la fin.
- Un appel explicitement synchrone (`background: false`) reste borné par le timeout MCP (`DEFAULT_TOOL_TIMEOUT_MS = 30000ms`, configurable via `GENOS_MCP_TOOL_TIMEOUT_MS`, plafond 30 min).
- Pour `genos_biological_mode`, le comportement asynchrone reste inhérent — préférer un suivi via télémétrie/progress plutôt qu'une attente synchrone.

Investigations restantes :
- [ ] Vérifier si Hermes expose une config de timeout MCP côté client
- [ ] Pour biological_mode : vérifier si la fonction dispatch_biological peut retourner immédiatement
