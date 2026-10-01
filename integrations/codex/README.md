# GenOS pour Codex

- **Statut** : Connexion et workflows P0 implémentés ; application systématique des gates aux éditions natives à qualifier.
- **Dernière revue** : 2026-10-01.

Le serveur Node évite de dépendre d'un binaire MCP Rust absent. Le CLI Rust
reste nécessaire pour les snapshots, capsules et replay. Installer les dépendances
avec `npm ci --prefix backend` et `npm ci --prefix mcp`, puis construire
`cargo build -p genos-cli`.

`node integrations/codex/configure.cjs` affiche une configuration avec chemins
absolus et une lease de développement explicite. Le `.mcp.json` du dépôt est
un exemple pour les clients qui lisent ce format ; sa présence ne configure pas
à elle seule Codex. Pour une installation MCP directe, transposer cette configuration
dans les tables `mcp_servers` de la configuration Codex.

Pour réparer le plugin GenOS déjà installé :

```powershell
node integrations/codex/configure.cjs --plugin-dir "CHEMIN_DU_PLUGIN_GENOS"
```

Le programme exige un plugin existant, sauvegarde son ancienne configuration
MCP dans `.mcp.json.before-p0`, conserve les autres serveurs et variables,
remplace le serveur GenOS par Node et synchronise les skills versionnés ici.
Recharger le plugin puis ouvrir une nouvelle session : le catalogue de la session
en cours ne se renouvelle pas par cette opération. Une mise à jour du cache du
plugin peut écraser cette réparation locale ; réinstaller depuis cette source.

Les skills de mémoire et diagnostic utilisent leurs handlers existants. Les skills
sans opération directe utilisent une mission `genos_orchestrate` et exigent des
preuves du résultat demandé. Une mission n'est pas une implémentation dédiée
de chaque ancien nom d'outil. Le mode `executor: "codex"` lance un runtime séparé,
tandis que `caller_mcp` nécessite Sampling côté hôte.

La lease n'inclut ni restauration destructive ni fusion automatique. Les opérations
de persistance ne vérifient pas à elles seules les références de preuves et ne
promouvent pas le code. `genos_diagnose` exige des hypothèses formulées par l'hôte
pour éviter une génération implicite par un autre modèle.

Vérifier avec `npm --prefix mcp test` et
`node integrations/codex/test_configuration.cjs` puis
`npm --prefix mcp run test:checkpoint` après construction du CLI. Le gate global et les tests
workspace restent obligatoires ; leurs échecs existants doivent être signalés.
