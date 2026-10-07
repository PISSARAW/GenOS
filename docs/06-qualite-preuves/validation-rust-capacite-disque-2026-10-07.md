# Validation Rust : capacité disque et PDB — 7 octobre 2026

## Problème observé

Les exécutions précédentes de `cargo test --workspace` échouaient au lien MSVC
avec `LNK1180` ou `LNK1201`, avant une validation intégrale. Le répertoire
`target` mesurait environ 11,05 Go : 5,07 Go de cache incrémental Rust et
1,71 Go de fichiers PDB. C: ne disposait initialement que de 2,58 Go libres.

Un probe confirme qu'un profil sans informations de débogage et avec
`strip = "debuginfo"` produit encore un PDB MSVC. Le contrôle de la génération
des PDB doit donc également porter sur le lien, pas seulement sur `debuginfo`.

## Correction et exécution

La configuration `.cargo/config.toml` impose `/DEBUG:NONE` et `/INCREMENTAL:NO`
au lien MSVC. Les profils `dev` et `test` désactivent le cache incrémental Rust
et les informations de débogage. Les assertions et les contrôles de débordement
restent activés. Deux jobs limitent la concurrence de compilation.

Le nettoyage est limité au cache incrémental et aux PDB générés sous
`target/debug`. Une autre compilation verrouillant ce répertoire, la validation
utilise un cache indépendant sur D:. Le chemin local n'est pas inscrit dans la
configuration portable du dépôt. Le probe de ce cache réussit sans produire de
PDB ; ses commandes rustc ne désactivent pas les assertions.

Commande PowerShell de reproduction dans cet environnement :

```powershell
$env:CARGO_TARGET_DIR = 'D:\GenOS-build\cargo-target-20261007'
cargo test --workspace
```

Les tests de chemins doivent pouvoir canonicaliser le workspace Windows. Les
refus d'accès du sandbox ne doivent pas être transformés en autorisations dans
le validateur. L'exécution utilise les accès natifs accordés pour la validation.

## Résultats

`cargo test --workspace` termine avec le code **0**, le 7 octobre 2026 à
06:01:24, heure de Paris. Le journal compte **671 tests réussis**, aucun échec
et aucun test ignoré. Les 80 résumés de suites comprennent 18 suites de doctests
sans exemples exécutables. Les 503 fichiers d'entrée Rust, manifests et
configuration ont des empreintes identiques avant et après cette exécution.

Le cache isolé mesure **1,86 Go**, avec **zéro PDB** et **zéro fichier incrémental**.
C: dispose de 6,34 Go libres et D: de 213,13 Go au relevé final. Ces mesures
restent locales à cette machine et peuvent évoluer avec les autres compilations.

La validation a également permis de corriger des blocages présents dans les
sources en cours de refactorisation : retours du dispatch biomimétique,
compteur de jetons aligné sur le contrat `u32`, visibilité des arguments de
bioluminescence et sept fonctions MCP dupliquées. Le validateur MCP accepte de
nouveau `null` comme arguments de chemins vides, conformément au comportement
précédent ; tableaux, chaînes, chemins absolus et traversées restent rejetés.
Les 21 tests du serveur MCP passent.

Les contrôles complémentaires du dépôt ne permettent pas de déclarer toute
la qualité P0 terminée. Le dernier scan qualité relève 121 violations, dont
deux nouvelles dans des changements backend parallèles : taille de
`backend/bin/run_agent_world_card_games.js` et complexité de
`backend/src/services/graphRagService.js`. Les corrections Rust n'ajoutent
aucune violation. `npm test` échoue séparément dans le test d'apoptose :
`terminateActiveAgents` est appelé sans définition dans
`backend/bin/genos-apoptosis.cjs`. Ces blocages ne sont pas des erreurs disque
ou PDB et restent à traiter dans le travail backend.

Les preuves locales sont conservées dans le dossier `p0-rust-capacity` de cette
session : mesures disque, probes, paramètres effectifs, empreintes des sources
Rust, journaux et codes de sortie. La baseline de qualité reste inchangée.
Les preuves finales sont `workspace-verified.log`,
`workspace-verified-result.json`, `workspace-summary.json`, `disk-final.json`
et `quality-complete.json`. Les premières tentatives en échec sont également
conservées, sans être présentées comme validations réussies.

## Références

- [Profils Cargo](https://doc.rust-lang.org/cargo/reference/profiles.html).
- [MSVC : génération des informations de débogage](https://learn.microsoft.com/en-us/cpp/build/reference/debug-generate-debug-info?view=msvc-170).
- [MSVC : lien incrémental](https://learn.microsoft.com/en-us/cpp/build/reference/incremental-link-incrementally?view=msvc-170).

Cette configuration sacrifie les symboles PDB utiles au débogueur pour borner
le stockage de validation. Une session de débogage avec symboles doit adapter
explicitement le profil et l'option de lien MSVC.
