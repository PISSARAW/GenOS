# Studio — suivi de la parité

- **Statut** : Programme en cours ; aucune parité globale revendiquée.
- **Dernière revue** : 2026-10-07.

## F02 — Base et risques de consolidation

La reprise part du worktree propre `codex/studio-completion` à `6a3c7b6f`.
Son ancêtre commun avec `v3` est `b7e39894` ; `v3` est observée à
`ed9af6fa`. Le checkout principal contient des modifications opérateur
MCP/VFS et des fichiers non suivis. Il n'est ni restauré ni fusionné.

La branche isolée conserve les huit lots Studio. Cette décision ne signifie
pas que ses dépendances sont à jour avec tous les travaux de `v3`.

| Zone divergente | Risque | Stratégie avant intégration finale |
| --- | --- | --- |
| Studio HTML/JS/CSS et README | Main conserve un client différent, dont pagination | Adapter les parcours explicitement ; aucun remplacement aveugle |
| package.json backend et dépendances | Scripts et versions évoluent des deux côtés | Fusionner par clé, vérifier lockfile et installation |
| Fixtures B06 et productProofRoutes | Assertions main ne ciblent pas toutes les vues modulaires | Qualifier les parcours de cette branche ; réconcilier les deux harnais |
| consumerInspectionService et contrôleur | Pagination et contrat des listes évoluent | Choisir le contrat versionné après audit |
| CLI/env/runtime/VFS/MCP | Autorisation, timeout et exécution changent | Ne pas importer du dirty checkout ; requalifier au futur merge |
| ADR et index | Plusieurs documents 0348, nouveau 0349 dans main | Réserver 0350 Studio ; générer l'index sans renommer les chemins |
| Manifeste expérimental GVX | Main apporte des primitives utiles au laboratoire | Relier après qualification, ne pas créer un contrat concurrent |

Les commandes de diagnostic sont `git status --short`, `git log -8 --oneline`,
`git merge-base HEAD v3` et `git diff --name-only HEAD...v3`.
L'audit est un constat ponctuel : les autres travaux peuvent continuer.
L'intégration finale sera un point séparé, avec résolution et tests.

## Registre des points

| Point | État | Preuve / limites |
| --- | --- | --- |
| F01.1 Matrice | Livré : aad3bf6b | Tous les lots F/C/S recensés ; benchmark concurrentiel non exécuté |
| F02.1 Base isolée | Livré par ce document | Git inspecté, checkout opérateur conservé |
| F03.1 Contrats | Livré : ADR 0350 | Frontières UI/API/runtime, routes et sessions |
| F04.1 Harnais | Qualifié Windows | Port attribué par l'OS, origine exacte, résultat structuré ; Edge 154.0.4258.62, aucune erreur de page |
| C01 Navigation | À réaliser | Connexion, contexte, routes et historique |
| C02 Composants | À réaliser | Données métier lisibles et JSON secondaire |
| C03 Accessibilité | À réaliser | Contrôles de toutes les vues ; pas de certification présumée |
| C04 Onboarding | À réaliser | Guide et diagnostics sans création implicite |
| Autres C/S | Planifiés / partiels selon matrice | Aucune clôture implicite |

## Limites de l'outillage

La recherche MCP GenOS des échecs antérieurs a réussi. Le checkpoint
`genos_snapshot` demandé avant les modifications a expiré après 120 secondes.
Le fichier `studio-parity-start.json` attendu dans la session est absent.
Ce checkpoint n'est donc pas une preuve acquise. La décision de base isolée
est persistée sous `decision-dbd96b47-212a-4d27-b3db-a2dc03f09d4b`, sans
promotion. Les commits et résultats exécutables restent les preuves locales.
L'activation effective des hooks n'est pas attestée.

## Prochaines preuves

F04 : `npm --prefix backend run test:studio:browser` a réussi sur la
base SQLite isolée, avec approbation réelle, refus tenant, reconnexion SSE,
conflit éditeur, restauration, protocole, rejeu et annulation.
Le démarrage Edge dans le sandbox Windows a échoué ; la relance autorisée
hors sandbox a réussi. Les artefacts sont sous
`.genos-tests/studio-parity-proof/`, jamais une preuve Linux.

Pour chaque point : vérifier qualité, exécuter les tests concernés, conserver
captures/versions dans un répertoire ignoré et mettre à jour ce registre.
Les gates globaux seront réexécutés avant la fin de cette tranche.
Une validation Windows ne qualifie pas Linux/Docker ni un fournisseur réel.

Voir [la matrice](studio-parite-plan.md) et
[la qualification des huit lots](studio-qualification.md).
