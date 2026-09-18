# ADR 0025 — Évaluation bornée de la fiabilité cognitive

- **Statut** : Accepté
- **Date** : 2026-09-18
- **Domaine** : Reliabilisme, épistémologie, promotion
- **Lié à** : [socle épistémique](0019-socle-epistemique-du-savoir.md), [contexte scientifique](0024-contexte-epistemique-scientifique.md)

## Décision

Le concept `epistemology.reliabilism` utilise un service dédié qui calcule une
fréquence de succès sur des observations explicitement fournies. Le service
signale les observations insuffisantes, les processus contestés et les
contre-exemples ; il ne conclut pas à la vérité des sorties.

Le service reste sans effet de bord, conserve un contexte épistémique
interprétatif et retourne `promotionEligible: false`. Les formes plus fortes du
reliabilisme et de la vertu épistémique restent hors de ce périmètre.
