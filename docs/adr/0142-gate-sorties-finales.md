# ADR 0142 — Gate des sorties finales

## Statut

Accepté.

## Décision

Avant émission ou completion, chaque phrase factuelle doit citer une
proposition connue. Les nombres de la phrase doivent apparaître dans les
propositions citées. Une proposition à issue `failed`, `refuted` ou `rejected`
ne peut pas être formulée comme un fait positif. Les propositions contestées
ou reliées par contradiction restent bloquées tant qu’elles ne sont pas
marquées comme incertaines.

Le gate retourne les violations structurées et expose `completionAllowed`.
L’absence de violation ne crée aucune preuve nouvelle; elle signifie seulement
que la sortie respecte les preuves compilées.
