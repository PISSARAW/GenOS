# ADR 0244 — Compiler de trajectoires cognitives AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, mémoire de trajectoire, procéduralisation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0007, ADR 0242, ADR 0243

## Contexte

AGOW peut produire des frames, requêtes, livraisons et outcomes. Le runtime procédural
dispose déjà de gates d'immunité, de validation causale, de sémantique et de promotion.
Une trajectoire répétée ne doit pas contourner ces autorités.

## Décision

Ajouter un store de trajectoires par agent qui conserve les identifiants de frames,
candidats, requêtes, actions et outcomes avec références de preuve et contexte. Le
compiler réutilise `proceduralConsolidationService` pour chercher un sous-chemin commun
et un taux de réussite suffisant. Il retourne une proposition `proposal_only` avec ses
sources et preuves, sans créer de génome procédural, activer une route ou demander sa
promotion.

Les trajectoires contrefactuelles ne sont pas admissibles. Le compilateur refuse une
proposition quand une trajectoire réussie manque de références probantes. La promotion
reste une action distincte du runtime procédural existant.

## Conséquences

### Positives

- Les propositions sont traçables jusqu'aux références de trajectoire et d'outcome.
- La recherche de sous-chemin réutilise le consolidateur existant.
- La compilation ne change pas l'autorité du runtime procédural.

### Négatives

- Le store n'est alimenté que par les intégrateurs qui appellent explicitement
  `cognitiveTrajectoryService.record`.
- Il ne vérifie pas que la séquence fournie représente toutes les étapes observées.

## Alternatives

- Promouvoir automatiquement après trois répétitions : rejeté, car cela contournerait
  les validations et gates du runtime procédural.
