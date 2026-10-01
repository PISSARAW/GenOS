# ADR 0252 — Curriculum de compétences GVX sous budget

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, compétences, apprentissage

## Contexte

Le graphe GVX fournit des propositions et relations de prérequis, mais ne
définit pas comment former un curriculum borné sans confondre hypothèses,
compétences acquises et autorité d'exécution.

## Décision

Le planificateur produit une proposition append-only dans le registre GVX. Il
rejette les cibles inconnues ou dupliquées, demande l'autorisation par
compétence, interroge une source externe pour chaque prérequis, et borne les
étapes par coût estimé et nombre maximum. Les évaluations non retenues
(refusées, prérequis bloqués, coût inconnu, budget dépassé ou limite d'étapes)
restent visibles. Toute étape proposée conserve l'étiquette épistémique
`hypothesis`; planifier ne prouve ni n'exécute l'apprentissage.

## Conséquences

- Les propositions sont reproductibles depuis le graphe, les entrées et les
  versions des adaptateurs conservées par l'appelant.
- Aucun accès runtime, choix de modèle, outil ou contenu de suite cachée n'est
  accordé au planificateur.
- L'adaptation à une population de tâches et l'intégration de résultats
  indépendamment vérifiés restent à réaliser.

## Alternatives considérées

- Planifier depuis des scores de compétence auto-déclarés : rejeté, faute de
  preuve indépendante et de source fiable.
- Laisser le candidat dépasser le budget si son score agrégé le justifie :
  rejeté, les limites dures ne sont pas compensables.
