# 0129 — Runtime contractuel des variants Holobionte

- **Statut** : accepté
- **Date** : 2026-09-26
- **Domaine** : orchestration, Holobionte
- **Lié à** : [ADR 0110](0110-catalogue-central-des-variants-morphologiques.md), [ADR 0124](0124-selection-automatique-des-variants.md)

## Contexte

Les variants Holobionte exprimaient leurs paramètres au moment de la composition, mais les
capacités de placement, mémoire, compétition, recrutement, outils et synchronisation n'avaient
pas de fonctions communes pour valider leurs entrées, preuves et décisions.

## Décision

- Fournir des plans purs et validés pour dépendances d'organelles, adaptation écologique,
  placement, consolidation mémoire, comparaison à budget égal, recrutement procédural,
  admission d'outils, réconciliation edge et régénération.
- Exiger les preuves, autorisations, leases, budgets ou provenances nécessaires avant de déclarer
  une action éligible. Les conflits restent non résolus et l'assimilation reste explicitement
  distincte de la planification.
- Exposer ces opérations depuis le service Holobionte pour que les adaptateurs puissent les
  appeler sans prétendre que la planification lance un fournisseur ou un exécuteur distant.
- Persister la sélection du variant et les évaluations sous forme d'événements versionnés de la
  session. Chaque évaluation exige une preuve vérifiée par un callback indépendant et conserve
  un reçu borné avec empreinte du résultat, références de preuve et historique limité.
- Conserver les variants au statut partiel tant que les fournisseurs cloud/edge, le transport
  chiffré, les magasins spécialisés et les expériences de fitness/récupération ne sont pas reliés
  et vérifiés de bout en bout.

## Conséquences

### Positives

- Les décisions de remplacement, de placement et de synchronisation peuvent être auditées avant
  leurs effets persistants.
- Les adaptateurs locaux et distants partagent les mêmes vérifications de contrat.

### Négatives

- Les plans refusent les opérations lorsque les preuves ou l'état d'infrastructure manquent.
- Les fonctions ne remplacent pas les contrats spécifiques des fournisseurs et n'exécutent pas
  automatiquement les plans.

## Alternatives

- Marquer chaque variant complet à partir de son seul objet de configuration : rejeté, car cela
  confond sélection de politique et capacité d'exécution.
- Implémenter chaque intégration fournisseur dans le noyau : rejeté, car cela couplerait le
  runtime aux infrastructures cloud, edge et outils concrètes.
