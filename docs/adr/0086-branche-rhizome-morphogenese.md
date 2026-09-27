# ADR 0086 — Branche Rhizome dans la Morphogenèse

- **Statut** : Accepté
- **Date** : 2026-09-27 (proposé le 2026-09-24, accepté le 2026-09-27)
- **Domaine** : Morphogenèse, Rhizome, exploration, preuves, budgets
- **Décideurs** : GenOS
- **Lié à** : [ADR 0051](0051-morphology-graph-and-topology-contracts.md), [ADR 0085](0085-integration-morphogenese-holobionte.md), implémentation `backend/src/services/morphogenesis/rhizomeBranchAdapter.js`, test `backend/tests/test_morphogenesis_rhizome_branch.js` (constaté, non rejouable dans l'environnement de revue du 2026-09-27 — binding natif `sqlite3` invalide, à rejouer ; aucune défaillance de code constatée)

## Contexte

La Morphogenèse peut décrire Rhizome comme topologie, mais un plan morphologique
devrait aussi pouvoir adjoindre une branche d'exploration distribuée à une topologie
de travail existante. Cette branche ne doit ni s'activer implicitement ni échapper
aux budgets et gates épistémiques du graphe parent.

## Décision proposée

Ajouter au graphe Morphogenèse une branche Rhizome enfant sur demande explicite du
planificateur. Elle reste à l'état proposé, possède un budget de croissance positif
et décrit la promotion de ses résultats comme vérifiée uniquement. Sans demande
explicite, le graphe reste inchangé. Cette intégration ne rend pas la branche
exécutable ou admise à elle seule.

## Conséquences

### Positives

- L'exploration Rhizome peut être composée avec une topologie Morphogenèse existante.
- L'absence de Rhizome demeure un cas de référence testable.
- Le budget de croissance et la barrière de vérification restent explicites.

### Négatives

- Le demandeur doit fournir le budget de croissance ; sinon le plan est refusé.
- Le graphe proposé ne prouve ni l'exécution de Rhizome ni la qualité de ses résultats.

## Alternatives

- Remplacer toute la topologie par Rhizome : écarté pour les missions qui ont aussi
  besoin d'une organisation de travail stable.
- Activer Rhizome selon un seuil d'incertitude : différé, faute de politique de
  sélection établie pour ce branchement.
