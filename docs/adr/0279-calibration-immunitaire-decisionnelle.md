# ADR 0279 — Calibration immunitaire décisionnelle

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, immunité, mémoire épistémique
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0206, ADR 0277

## Contexte

Le runtime calculait une calibration immunitaire après la revue, mais celle-ci ne
modifiait ni la décision ni la mémoire transmise aux sorties suivantes.

## Décision

Une calibration qui signale une sur-réaction impose une décision `REVIEW` et bloque
l'autorisation courante jusqu'à réexamen de la politique. Les résultats de revue,
autorisés ou bloqués, sont ajoutés à la mémoire du lot; les évaluations persistantes
en conservent les reçus. Une calibration ne contourne jamais les vérificateurs
indépendants.

## Conséquences

### Positives

- La calibration a un effet explicite sur l'autorisation.
- Les sorties suivantes d'un lot reçoivent l'historique de décisions précédent.

### Limites

- La mémoire durable est assurée par les reçus de workflow, pas par un registre
  autonome de mémoire immunitaire.
- La revue manuelle reste requise pour lever un blocage de calibration.

## Alternatives

- Laisser la calibration à titre informatif : rejeté, car elle ne corrigerait pas les
  faux positifs constatés.
