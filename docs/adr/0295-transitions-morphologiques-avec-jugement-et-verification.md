# ADR 0295 — Transitions morphologiques avec jugement et vérification

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Morphogenèse, transitions et preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0124, ADR 0294

## Contexte

L'exécuteur de patch acceptait une transition sans adjudicateur en produisant
`approved: true`, puis sans vérificateur en produisant `valid: true`. Le
résolveur de variants fabriquait aussi des entrées `present: true` à partir des
types de preuves requis et annonçait `changed: true` après un échec. Ces
comportements confondaient l'existence d'une règle avec sa preuve et son
autorisation.

## Décision

L'exécuteur exige des adaptateurs explicites d'adjudication et de vérification.
Seuls `approved === true` et `valid === true` permettent le commit. Le runtime
peut recevoir l'adjudicateur dans son contexte d'exécution ; il conserve sa
vérification structurelle. Le résolveur transmet uniquement les preuves, le
plan de retour arrière et, pour un changement de topologie, le plan de
migration fournis par l'appelant. Il renvoie le graphe committé sans modifier
le graphe source, et ne signale un changement qu'après réussite.
Chaque patch est évalué sur le graphe candidat pendant le contre-factuel,
y compris les changements de variant et de budget.
Le kernel ne crée plus le claim `step_succeeded` à partir d'un champ absent
de ses observations.

## Conséquences

- Une transition sans jugement ou vérification échoue de manière explicite.
- Les appelants doivent fournir les plans et adaptateurs requis pour les
  transitions qu'ils veulent réellement committer.
- Un test couvre l'absence des adaptateurs, les réponses non booléennes, le
  refus faute de preuve et le commit avec graphe source inchangé.
- Ce contrôle ne qualifie pas la qualité de l'adjudicateur ou des preuves :
  cette évaluation appartient aux campagnes avec un oracle indépendant.

## Alternatives

- Garder l'approbation implicite pour faciliter les démonstrations : rejeté,
  car elle donnait à une réussite de transport la valeur d'une décision valide.
