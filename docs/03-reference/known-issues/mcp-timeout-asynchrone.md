## Timeout MCP pour outils asynchrones

Les outils MCP qui déclenchent des missions asynchrones longues (`genos_orchestrate`, `genos_biological_mode`, `genos_delegate_worker`) peuvent
timeouter à 30s côté CLIENT HERMES MCP. Ce n'est pas une limitation du serveur GenOS (DEFAULT_TOOL_TIMEOUT_MS = 300000ms = 5min).

Cause : le bridge MCP client Hermes impose un timeout de 30s sur les appels d'outils. Les outils asynchrones qui attendent la fin de la mission
dépassent ce budget.

Mitigation :
- Utiliser `background: true` (valeur par défaut pour `genos_orchestrate`) pour obtenir un reçu d'acceptation immédiat sans attendre la fin.
- Pour `genos_biological_mode` et `genos_delegate_worker`, le comportement asynchrone est inhérent — vérifier si des options de background existent.

Investigations nécessaires :
- [ ] Vérifier si Hermes expose une config de timeout MCP (GENOS_MCP_TOOL_TIMEOUT_MS côté serveur)
- [ ] Vérifier si ces outils supportent un mode background/async dans les schémas
- [ ] Pour biological_mode : vérifier si la fonction dispatch_biological peut retourner immédiatement
