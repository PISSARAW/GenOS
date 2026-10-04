# ADR 0295 — Mémoire immunitaire AEIS portée et résolue par preuve

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : AEIS, mémoire, SQLite, multitenance
- **Lié à** : ADR 0294

## Contexte

La mémoire existante utilisait une signature globale, sans frontière de workspace. Le chemin
runtime persistait des entrées `pending`, mais ne résolvait jamais une exposition à partir
d'un verdict vérifié. Une écriture obsolète pouvait écraser les compteurs d'une autre
session, et le helper local acceptait une réussite déclarative.

## Décision

La nouvelle table associe la signature à la portée organisation, projet et workspace. Les
anciennes entrées sans portée restent hors de cette table : leur propriétaire ne peut pas
être déduit de manière sûre. Les insertions d'exposition ne réécrivent pas les résultats
acquis. Une résolution relit l'assemblée scellée en base, lie le prédicat au FormalResult,
et calcule réussite ou réfutation à partir des reçus signés. L'identifiant de run et de
résultat déduplique la résolution dans une transaction. Chaque portée conserve au plus
1 000 signatures selon l'affinité et la date.

## Conséquences

- Positives : rappel isolé, apprentissage mesurable après preuve, reprise et réessai
  idempotents, affinité protégée contre les écritures obsolètes.
- Négatives : la mémoire historique globale n'est pas importée automatiquement ; une
  migration humaine avec attribution de portée serait nécessaire pour la récupérer.

## Alternatives

Ajouter une colonne de portée avec valeur par défaut à la table globale aurait partagé
des observations entre tenants. Conclure sur `host.accepted` aurait confondu décision
et vérité.
