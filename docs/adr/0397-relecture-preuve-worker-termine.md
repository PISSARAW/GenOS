# ADR 0397 — Relecture bornée des preuves de workers terminés

- **Statut** : accepté, implémenté
- **Date** : 2026-10-12
- **Domaine** : Autorité, orchestration, preuves déléguées
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0396](0396-credit-externe-regulation-workers.md), [plan de réalisation](../02-orchestration/plan-implementation-regulation-ressources-orchestrate.md)

## Contexte

Une mission parent peut finir sa synthèse après l'expiration de l'autorité d'action d'un worker. La relire avec `assertRun` échoue alors même que le worker, sa preuve externe et son acceptation ont tous été scellés avant l'échéance. Augmenter la durée de l'autorité du worker prolongerait ses pouvoirs d'action uniquement pour faciliter une lecture ultérieure.

## Décision

1. Garder `assertRun` comme contrôle obligatoire pour les actions présentes, les appels d'outils et les mutations.
2. Ajouter une voie de lecture réservée aux preuves déléguées d'un run `completed`. Elle confronte `completed_at` dans SQLite à l'événement terminal biologique vérifié; les deux doivent être proches, et le plus tardif doit précéder l'expiration de l'enveloppe scellée.
3. Au temps de fin enregistré, revérifier l'identité et le scope scellés, l'appartenance à la mission et le lease courant. Le parent garde toujours une autorité active au moment de sa propre clôture.
4. Revalider l'attestation, l'assemblage historique, le rapport, le sujet, le worker, le contrat, les coûts, les deux reçus indépendants et leur liaison cryptographique. L'acceptation doit correspondre à l'attestation et avoir été décidée entre la fin de l'attestation et l'expiration de l'enveloppe enfant.
5. Refuser un run incomplet, une date de fin manquante ou après l'échéance, une preuve modifiée, une acceptation tardive, ou un changement d'identité, de tenant, de mission ou de lease. Cette exception de lecture n'autorise aucune action rétroactive.

## Conséquences

### Positives

- Une synthèse parentale longue peut citer un résultat enfant déjà vérifié sans accorder plus de temps d'exécution au worker.
- Les opérations continuent d'échouer fermé si l'autorité actuelle, la provenance ou l'acceptation ne concorde pas.

### Négatives

- La date de clôture, l'événement terminal vérifié et le journal d'acceptation deviennent des éléments essentiels de l'audit et doivent rester immuables.
- Cette règle ne prouve pas à elle seule la reconstitution auprès d'un fournisseur commercial, la reprise après crash du fournisseur, ni la couverture sémantique de toute méthode native.

## Alternatives écartées

- **Allonger l'autorité de chaque worker** : étend la fenêtre d'action et mélange exécution et rétention d'une preuve.
- **Ignorer l'expiration dans `assertRun`** : affaiblit les contrôles des outils et mutations.
- **Faire confiance au seul reçu historique** : ne revalide pas ses liens au run, au rapport et au tenant.
