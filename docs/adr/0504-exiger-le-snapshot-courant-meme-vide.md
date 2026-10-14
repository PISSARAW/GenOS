# ADR 0504 — Exiger le snapshot courant, même vide

- **Statut** : Accepté et implémenté pour la réutilisation mémoire.
- **Date** : 2026-10-15
- **Domaine** : État versionné, dépendances et cache de résultats.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0493, comparaison exacte du snapshot ; ADR 0494, scope workspace ; ADR 0500, preuve avant réutilisation.

## Contexte

`dependencyFailureReason` convertissait l'absence du snapshot courant en `{}`
lorsque le résultat stockait lui-même un objet de dépendances vide. La réutilisation
ne distinguait donc pas « aucune dépendance, confirmé par l'appelant » de « aucun
snapshot fourni ».

## Décision

Tout résultat réutilisable exige un objet `dependencies` courant, même lorsque le
snapshot stocké est vide. Une propriété absente donne un miss
`dependencies-unavailable`; un objet `{}` explicite peut correspondre à un
snapshot stocké `{}`. Les objets mal formés restent refusés.

## Conséquences

### Positives

- Le cache n'infère plus l'absence de dépendances à partir d'une entrée omise.
- Le test distingue le miss sans snapshot du hit avec un snapshot explicitement
  vide.

### Négatives

- Les appelants doivent transmettre explicitement `{}` pour confirmer un résultat
  indépendant de l'environnement courant.
- Les anciens appels sans snapshot perdent les hits plutôt que de bénéficier
  d'une hypothèse implicite.

## Alternatives

- Continuer à convertir l'absence en objet vide : rejeté, car cela efface la
  différence entre inconnue et vide.
- Réserver la vérification aux snapshots non vides : rejeté, car un snapshot
  vide peut aussi être une déclaration significative qui doit être confirmée.
