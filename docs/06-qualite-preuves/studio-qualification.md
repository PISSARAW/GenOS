# Studio — qualification du 2026-10-07

## Portée

Huit lots implémentés dans le worktree isolé `codex/studio-completion`, depuis
`b7e39894`. Les modifications préexistantes du checkout opérateur sont conservées.
Cette qualification porte sur les parcours Studio et leurs contrats backend,
pas sur la maturité universelle des moteurs scientifiques ou biologiques.

Plateforme exercée : Windows x86_64, Node.js 24.18, Rust 1.97.1,
Edge 154.0.4258.62 piloté par Playwright headless. Vues desktop 1280 × 1000
et mobile 390 × 844 ; aucune erreur JavaScript de page observée.

## Résultats exécutés

| Vérification | Résultat et portée |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Aucune nouvelle violation ; dette existante conservée |
| `npm test` | Gate obligatoire réussi : suites biologie, backend et garage |
| `cargo test --workspace` | Réussi en mode offline, target isolé ; avertissements existants |
| `npm --prefix backend run test:studio` | Huit suites réussies sur win32 |
| `npm --prefix backend run test:studio:browser` | Parcours réels, desktop/mobile, sans erreur de page |
| `npm --prefix backend run test:mcp` | Six suites réussies |
| `npm --prefix backend run test:grpc` | Suite des 41 services réussie ; pas une preuve universelle de validité métier |
| `npm --prefix backend run test:quality` | Onze suites réussies |
| Écriture multiprocessus | Deux serveurs et une version : HTTP 200 + 409, seul contenu gagnant persisté |
| Restart natif Windows | PID et instance changés, opération persistée et privée au tenant |

Les fixtures utilisent bases et workspaces temporaires, sans missions utilisateur.
Le navigateur exerce promotion signée réelle, provenance, refus de preuve altérée,
snapshot, filtrage tenant, SSE/reconnexion, diff et restauration réelle.
Le brouillon survit à un conflit et à une perte réseau simulée. Une modification
pendant la réponse de sauvegarde reste identifiée comme non enregistrée.
Le laboratoire persiste un protocole et une hypothèse, exécute un job fixture,
compare et rejoue les entrées capturées, puis annule un job en attente.

Les suites ciblées vérifient liens physiques et jonctions hors workspace,
secrets et noms Windows protégés, scopes étrangers, hash de capture altéré,
revues contradictoires sans promotion et conservation des entrées après mutation
du dataset. Un grader fixture réussi n'est pas un benchmark cognitif.

Captures et métadonnées locales : `.genos-tests/studio-proof/`, ignoré par Git.
Les reçus de commit et la mémoire GenOS fournissent une provenance de travail,
pas un certificat de correction du produit.

## Écarts non masqués

- `npm --prefix backend run test:validation` échoue dans le test historique
  `test_biological_benchmark_runner.js:31`. Il attend une complétude sans
  `stateValidation.status = verified`. Test et service sont inchangés par ces
  lots ; le gate de preuve n'a pas été affaibli pour satisfaire cette assertion.
- Linux/Docker n'a pas été qualifié. WSL Ubuntu 24.04 est disponible mais sans
  Node.js ; le client Docker est installé mais son daemon n'est pas accessible.
  Aucun environnement n'a été installé ou démarré implicitement.
- Le budget du protocole est déclaré, sans moteur d'exécution et d'enforcement
  automatique dans ce parcours. Le rejeu de protocole enregistre une nouvelle
  expérience et sa provenance, sans fabriquer de trial réussi.
- Les sorties de fournisseurs de modèles ne sont pas rendues déterministes.
  Les anciens jobs sans capture sont refusés pour un rejeu revendiqué fidèle.
- L'arène numérique et ses traces en mémoire ne qualifient ni toutes les
  topologies, ni les performances générales d'agents. HA, macOS, acteurs
  filesystem externes et fournisseurs réels restent hors de ces preuves.

Les huit lots livrés ne justifient donc pas une déclaration « produit à 100 % ».
Les écarts ci-dessus restent explicitement à fermer.

## Reproduction

Suivre AGENTS.md, puis exécuter les trois gates obligatoires et les scripts du
tableau. Pour le navigateur, installer les dépendances déjà prévues et fournir
un Chromium compatible ou `B06_BROWSER`. Choisir un dossier ignoré via
`GENOS_STUDIO_TEST_ARTIFACTS`. Prévoir suffisamment d'espace pour le target Rust ;
un `CARGO_TARGET_DIR` dédié évite d'effacer les caches d'autres travaux.

## Références

- [Acceptation des huit lots](../03-reference/studio-parcours-et-acceptation.md).
- [Exploitation native](../04-exploitation/studio-exploitation.md).
- [ADR 0348](../adr/0348-studio-modulaire-et-parcours-operateur.md).
