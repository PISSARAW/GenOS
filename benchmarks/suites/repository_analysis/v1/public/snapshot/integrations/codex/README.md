# GenOS pour Codex

- **Statut** : Profil P0 et hooks de session P1 implémentés ; activation effective dépendante de la confiance Codex.
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

## Contrôles P1

L'installateur ajoute `hooks/hooks.json` au plugin existant, avec des chemins absolus
vers les scripts versionnés du dépôt. Activer `[features] hooks = true` dans Codex,
recharger le plugin, puis **examiner et approuver ses hooks**. Codex ignore les hooks
non approuvés ; l'installateur ne modifie jamais cette confiance. Le manifeste source
est un gabarit d'installation : lancer `configure.cjs` pour produire les commandes.
Voir la [documentation officielle des hooks](https://learn.chatgpt.com/docs/hooks).

Ces hooks s'appliquent au workspace GenOS configuré, pas aux autres projets. Ils
créent une identité d'agent par session et fournissent ses chemins à Codex. Avant
Bash ou apply_patch, un appel MCP `genos_snapshot` doit réussir et produire un
artefact contenant l'identité attendue. Le snapshot est cognitif, sans sauvegarde
des fichiers. Les appels MCP restent accessibles pour amorcer ce checkpoint.

Le journal local ignoré `.genos-agent-worlds/codex-sessions/` conserve le checkpoint,
les empreintes SHA-256 des fichiers Git suivis et non ignorés, les commandes de
validation et leurs codes de sortie explicites. Stop demande une validation réussie
et un appel MCP `genos_record_experience` réussi sur l'empreinte courante lorsqu'elle
diffère du début de session. Une nouvelle modification invalide ces preuves.
SessionStart et les hooks de compaction réinjectent les chemins et l'état conservé.
L'expérience persistée ne déclenche aucune promotion.

Les commandes reconnues commencent par `npm test`, `npm run test...`,
`npm --prefix backend test/run test...`, `cargo test`, `node ...test....js/cjs/mjs`
ou le contrôle qualité Python. Le résultat doit exposer `exit_code` entier ou une
ligne exacte `Process exited with code N`. Les formats inconnus ne prouvent rien.
Ce filtre identifie une commande de validation ; il ne garantit ni sa pertinence
ni la couverture des tests. Les effets hors Git, fichiers ignorés, outils non couverts
par les hooks et détournements du journal local restent hors de cette garantie.
Le serveur MCP est lié au dépôt configuré ; les sous-répertoires et autres workspaces
nécessitent un profil adapté. Plusieurs appels simultanés d'une même session ne
sont pas pris en charge. Ne pas annoncer une gouvernance universelle de Codex.

Vérifier les gates avec `node integrations/codex/test_session_hooks.cjs`.

Sous Windows, la configuration générée utilise `commandWindows` et lance `node`
depuis le `PATH`. Après une mise à jour du hook, relancer `configure.cjs` sur le
plugin installé, recharger le plugin, puis approuver la définition mise à jour dans
Codex : l'ancienne commande citait `node.exe` comme chemin d'expression, ce qui
empêchait PowerShell de démarrer le script.
