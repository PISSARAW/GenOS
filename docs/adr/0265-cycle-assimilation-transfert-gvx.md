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
`consolidated`. Chaque étape de preuve exige un artefact lisible, un vérificateur du
registre de confiance du control plane et un SHA-256 recalculé sur les octets; les fenêtres
marquent aussi explicitement l'absence de régression. Le rejet reste accessible avant
consolidation.

La validité sémantique des outcomes reste celle du vérificateur enregistré dans le control
plane. Un nom et hash fournis par le receveur ne suffisent plus; l'hôte doit fournir le
lecteur d'artefacts et le registre scellé de l'ADR 0263.

## Conséquences

- La valeur d'un transfert est observée côté receveur avant sa consolidation.
- La consolidation exige la stabilité déclarée sur plusieurs contextes.
- L'hôte doit fournir la même source de confiance pour nursery, transfert et suivi.

## Alternatives

- Considérer `review_ready` comme assimilation : rejeté, car cela ne mesure aucun effet
  receveur.
- Hériter automatiquement le transfert après une seule expérimentation source : rejeté,
  car l'effet peut ne pas se transférer au receveur.
