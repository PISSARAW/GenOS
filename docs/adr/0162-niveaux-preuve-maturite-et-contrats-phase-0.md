# ADR 0162 — Niveaux de preuve de maturité et gel des contrats Phase 0

- **Statut** : Proposé
- **Date** : 2026-09-28
- **Domaine** : Maturité, contrats, preuves, gouvernance documentaire
- **Décideurs** : Mainteneurs GenOS
- **Lié à** :
  - `../06-qualite-preuves/contrats-capacites-phase-0.md` (contrats d'acceptation des sept capacités)
  - `../06-qualite-preuves/statuts-maturite.md` (statuts `actif`, `expérimental`, `bibliothèque`, `obsolète`, `à classer`)
  - `../06-qualite-preuves/registre-services.md` (fiches et matrice de câblage)
  - `../02-orchestration/topologies/trinity.md` (contrat opérationnel v1)
  - `../05-securite-gouvernance/conformite-et-gouvernance.md` (couverture outillée, non certification)
  - `../../backend/src/services/storageBackend.js` (`PostgreSQLBackend` stub)
  - `../../backend/src/services/trinityVariantService.js` (politiques marquées `implemented`)
  - `../../backend/src/philosophy/serviceMaturity.js` (`cognitionService: planned`)
  - ADR 0161 (contrats transversaux d'opération), ADR 0138 (persistance des reçus), ADR 0021b (promotion épistémique)

## Contexte

Le plan des sept capacités exige de figer les contrats avant tout code. Trois confusions bloquent ce gel :

1. Au moment de cette proposition, la présence d'un fichier ou d'un nom dans un catalogue était interprétée comme une implémentation (ex. adaptateurs Trinity `factorial_grid_executor`, `recursive_trinity_executor`, `oracular_executor` présents et politiques marquées `implemented`, alors que le contrat opérationnel Trinity refusait `factorial`, `recursive`, `oracular` avant lancement).
2. Les rapports de conformité (`complianceService`, CLI `genos compliance`) peuvent être lus comme une conformité réglementaire complète.
3. Il manque une distinction opposable entre code présent, branché au runtime, validé et annonçable, articulée avec les statuts existants (`actif`, `expérimental`, `bibliothèque`, `obsolète`, `à classer`).

## Décision

1. Quatre niveaux de preuve cumulatifs, mappés sur les statuts existants : `code-présent` (`bibliothèque` ou `à classer`), `branché-runtime` (`expérimental` minimum), `validé` (`expérimental` complet, candidat à `actif`), `annonçable` (`actif` avec matrice de câblage et documentation à jour).
2. Aucune promotion sur la seule présence d'un module, d'un nom de catalogue ou d'une équation documentée. Le passage à `branché-runtime` exige un chemin de production ; à `validé`, parcours nominal + refus + limites + reçu versionné ; à `annonçable`, matrice et exemples à jour.
3. Les contrats des sept capacités sont gelés dans `docs/06-qualite-preuves/contrats-capacites-phase-0.md` (interface, entrées, sorties, erreurs, permissions, limites, preuves). Tout écart d'implémentation ultérieur exige un amendement de ce document.
4. Clarifications opposables à la date de cette décision : Trinity — les parcours `factorial`, `recursive` et `oracular` étaient alors refusés au lancement ; conformité — les rapports restent une couverture de contrôles outillés, jamais une certification ; indicateurs — 14 propriétés Butlin et 15 familles GenOS non additionnables, `composed-perceptual` `planned`, étapes non évaluées à `not_run`/`unavailable`.
5. Frontières sémantiques : cognition sociale = analyse d'informations fournies, pas de lecture d'états mentaux ; validation causale = intervention + témoin comparables ; indicateurs = propriétés fonctionnelles mesurées, pas de score de conscience ; PostgreSQL seul ≠ haute disponibilité ; acceptation du contrat IDE ≠ compatibilité Antigravity ; paramètres appris ≠ constantes universelles.

## Conséquences

- Positives : promotions traçables, contradictions Trinity et conformité tranchées, phases 1 à 7 cadencées par des critères de sortie testables.
- Négatives : gel contraignant — chaque phase doit amender la spécification en cas d'écart ; périmètre Node en premier, sans équivalent Rust ni `spec/` sauf mention explicite.
- Neutres : les statuts existants sont conservés ; cet ADR ajoute la correspondance des quatre niveaux, sans renommage de fichiers (chemins scellés, ADR 0005).

## État révisé de Trinity (2026-10-03)

L'affirmation historique du point 4 sur les trois variants refusés ne décrit plus le dépôt
courant. L'ADR [0292](0292-execution-des-variants-trinity.md) et la fiche
[`trinity.md`](../02-orchestration/topologies/trinity.md) documentent les douze runners
désormais branchés et leurs gates. La campagne R3 pré-correctifs a produit douze escalades ;
ses rapports montrent que plusieurs runners n'avaient pas été invoqués. Aucune campagne
post-correctifs n'a encore vérifié le câblage actuel de bout en bout. Le statut reste donc
`partiel`; le principe « un module présent ne prouve pas une exécution valide » de cet ADR
demeure en vigueur.

## Alternatives

- **Promouvoir sur présence de module** : rejetée — confond import et câblage fonctionnel, contredit la règle `entrée → réutilisation` prouvée.
- **Statuts de maturité séparés par capacité** : rejetée — fragmentation ; la correspondance avec les cinq statuts existants suffit.
- **Reporter le gel des contrats** : rejetée — implémenterait des noms de capacité sans comportement précis.
