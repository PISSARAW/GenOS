# ADR 0265 — Cycle d'assimilation et consolidation des transferts GVX

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, transfert, outcome receveur, maturation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0062, ADR 0063a, ADR 0256, ADR 0264

## Contexte

Le cycle de transfert s'arrêtait à `review_ready`, sans enregistrer l'effet réellement
mesuré chez le receveur ni distinguer assimilation et consolidation longitudinale.

## Décision

Un transfert `review_ready` peut devenir `assimilated` avec un outcome receveur décrivant
une métrique, valeurs de référence et candidate, sens d'amélioration, référence d'artefact,
vérificateur et absence de régression. `assimilated` exige des fenêtres pour avancer à
`monitored`; `monitored` exige au moins trois fenêtres et contextes distincts pour devenir
`consolidated`. Chaque fenêtre fournit une référence d'artefact/vérificateur et marque
explicitement l'absence de régression. Le rejet reste accessible avant consolidation.

Les champs de vérificateur et hash de ce service représentent des références à des preuves,
pas une authentification locale indépendante. Le chemin doit être alimenté par reçus du
control plane et vérifié par l'adaptateur de confiance décrit dans l'ADR 0263.

## Conséquences

- La valeur d'un transfert est observée côté receveur avant sa consolidation.
- La consolidation exige la stabilité déclarée sur plusieurs contextes.
- Une évolution future devra lier directement ces reçus au registre de vérification de la
  nursery plutôt que d'accepter des métadonnées seules.

## Alternatives

- Considérer `review_ready` comme assimilation : rejeté, car cela ne mesure aucun effet
  receveur.
- Hériter automatiquement le transfert après une seule expérimentation source : rejeté,
  car l'effet peut ne pas se transférer au receveur.
