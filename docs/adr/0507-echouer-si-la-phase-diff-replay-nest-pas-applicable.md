# ADR 0507 — Échouer si la phase diff/replay n'est pas applicable

- **Statut** : Accepté et implémenté pour la phase stratégie.
- **Date** : 2026-10-15
- **Domaine** : Rejeu contrefactuel et transitions de phase.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0480, promotion exigeant un rejeu lié au run.

## Contexte

`executeStepPrimitives` vérifiait l'absence de primitives diff ou replay
uniquement après avoir filtré celles dont le contexte était complet. Si aucune
primitive n'était applicable, la fonction retournait `success: true` et
`applicable: false`, même pour la phase obligatoire `diff_and_replay`.

## Décision

Évaluer l'exhaustivité diff/replay avant le cas générique « aucune primitive
applicable ». La phase `diff_and_replay` échoue si les opérations diff et replay
ne sont pas toutes deux exécutables; la cause indique les primitives absentes
ou privées du contexte requis.

## Conséquences

### Positives

- Un contexte vide ou incomplet ne peut plus être enregistré comme réussite de
  la phase de rejeu.
- Le test couvre une seule primitive applicable et le cas où aucune ne l'est.
- Le gate `require_replay` demeure nécessaire : cette correction ne crée pas le
  producteur de reçu lié au run.

### Négatives

- Des stratégies avec une phase `diff_and_replay` incomplète échouent plus tôt et
  doivent fournir l'entrée requise avant de terminer la phase.

## Alternatives

- Retourner `success: true, applicable: false` pour préserver l'exécution des
  phases sans contexte : rejeté pour la phase obligatoire de diff/replay.
- Considérer un résultat inconclusif comme un rejeu réussi : rejeté, car aucune
  comparaison ou exécution n'a eu lieu.
