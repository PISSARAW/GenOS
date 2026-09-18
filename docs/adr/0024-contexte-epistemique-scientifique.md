# ADR 0024 — Contexte épistémique des analyses scientifiques

- **Statut** : Accepté
- **Date** : 2026-09-18
- **Domaine** : Méthode scientifique, vérité, promotion
- **Lié à** : [socle épistémique](0019-socle-epistemique-du-savoir.md), [promotion épistémique](0021-promotion-epistemique-des-decisions.md)

## Contexte

Les services de confirmation, falsification, méthode hypothético-déductive,
Duhem-Quine, théories de la vérité et scepticisme retournaient des diagnostics
utiles, mais leur statut interprétatif n'était pas directement transporté par
le résultat de service.

## Décision

Ces analyses retournent `epistemic_context` avec la méthode utilisée, le statut
du raisonnement, une provenance incomplète par défaut et
`promotionEligible: false`. La complétude de provenance doit être apportée par
un appelant disposant d'une preuve indépendante ; elle n'est jamais déduite de
la seule compatibilité des observations.

## Conséquence

Les résultats peuvent être transmis à la révision épistémique et aux gates de
promotion sans perdre leur caractère provisoire. Une confirmation, une théorie
de la vérité ou une réponse au scepticisme ne devient pas automatiquement un
fait vérifié.
