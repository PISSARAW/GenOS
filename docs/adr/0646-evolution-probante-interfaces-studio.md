# ADR 0646 — Évolution probante des interfaces Studio

- Statut : Accepté pour la tranche locale V0.
- Date : 2026-10-20.

## Contexte

Un générateur d'interface peut produire rapidement une apparence plausible sans
établir l'intention utilisateur, la cohérence du système de design, l'utilité
réelle ou l'autorité de publication. Une capture réussie n'est ni une observation
utilisateur ni une preuve d'effet. La boucle Studio existante sépare déjà revue,
publication locale et rollback ; la sélection de variantes doit respecter la
même frontière épistémique.

## Décision

Ajouter un domaine pur `studioInterfaceEvolution`, sans effet de bord ni route
de déploiement.

1. `contract.js` scelle par hash l'intention UX, le système de design et leur
   version. Une variante référence exactement ces versions et doit vivre dans un
   monde différent de la baseline. Sa création inscrit
   `deploymentAuthorized: false`.
2. `evaluation.js` exige les dimensions accessibilité, performance, cohérence
   et anti-générique. Chaque avis conserve évaluateur, méthode et référence de
   preuve. Des verdicts opposés produisent `DISPUTED` ; ils ne sont pas noyés
   dans une moyenne. Les captures et sessions utilisateur sont deux collections
   distinctes.
3. `governance.js` garde `NO_CHANGE` si une preuve manque, si les évaluateurs
   divergent, si aucune session utilisateur réelle n'est reliée, ou si le gain
   mesuré ne dépasse pas le seuil. Une dérive ouvre uniquement
   `OPEN_DIAGNOSTIC`. Un dossier de changement exige une autorité
   `interface:deploy` et un rollback lié à la baseline, mais n'exécute rien.

Les hashes assurent une identité reproductible du dossier ; ils ne certifient ni
la vérité des mesures ni l'indépendance organisationnelle des évaluateurs.

## Autorité, déploiement et rollback

La décision, l'autorisation et l'exécution restent trois événements différents.
Le nouveau domaine s'arrête à `READY_FOR_AUTHORIZED_DEPLOYMENT` avec
`deploymentExecuted: false`. Il n'appelle pas
`studioProductionDeployment.publish`. Le plan de rollback décrit une référence
de restauration et sa portée ; il ne prétend pas annuler des effets externes.

## Apprentissage transférable

La V0 conserve les références de protocole, d'effet et les rejets, ce qui rend
les dossiers comparables. Elle ne qualifie pas encore une règle comme
transférable entre projets et ne l'assimile pas au design system. Une tranche
ultérieure devra exiger au moins deux réplications indépendantes, expliciter les
contre-exemples et repasser les gates dans le projet receveur. Cette limite évite
de présenter une recommandation locale comme connaissance générale.

## Conséquences

- une variante esthétique ne peut pas s'auto-promouvoir ;
- les désaccords et données inconnues restent visibles ;
- la dérive déclenche une initiative diagnostique sans mutation silencieuse ;
- les services sont déterministes et testables sans navigateur ni déploiement ;
- persistance SQL, API HTTP, exécution A/B réelle, consentement de recherche et
  apprentissage inter-projets vérifié restent hors de cette tranche.

## Preuves exécutables

- `backend/tests/test_studio_interface_evolution.js`
- `backend/tests/test_studio_interface_evaluation.js`
- `backend/tests/test_studio_interface_governance.js`
