# ADR 0206 — Lier les décisions persistées à leurs preuves

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Décisions, provenance, preuves, isolation tenant
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0019, ADR 0021b, ADR 0029, ADR 0030

## Contexte

`genome_decisions` persistait le titre et le contenu d'une décision, tandis que les preuves vivaient séparément dans `provenance_records`. L'endpoint `POST /api/genome/decision` n'enregistrait aucun lien, de sorte que la mémoire ne pouvait distinguer une décision provisoire d'une décision appuyée par des références traçables.

## Décision

Chaque décision créée par cet endpoint reçoit un enregistrement de provenance Merkle dans la même transaction. La décision stocke le hash et l'identifiant de cet enregistrement, ses références de preuve et un statut `linked` ou `provisional`.

Les références doivent être des hashes SHA-256 d'enregistrements de provenance visibles dans le même scope tenant. Le premier hash devient le parent causal du reçu de décision; l'ensemble des références figure aussi dans son payload canonique. Un scope tenant incomplet est refusé.

L'absence de références reste permise pour conserver les décisions exploratoires, mais elles sont explicitement `provisional`. Un lien et un hash prouvent la traçabilité et l'intégrité du payload enregistré, pas la vérité métier de son contenu.

## Conséquences

### Positives

- L'enregistrement d'une décision, son état de preuve et son reçu de provenance sont atomiques.
- Les références étrangères au tenant et les références mal formées sont refusées.
- Les lecteurs peuvent distinguer une décision provisoire d'une décision reliée à des preuves.

### Négatives

- Les décisions existantes sont migrées avec le statut `provisional`; aucune preuve n'est inférée rétroactivement.
- Les appels qui veulent lier une preuve doivent d'abord persister celle-ci dans la chaîne de provenance.
- La validité métier des preuves demeure du ressort des vérificateurs et des gates spécialisés.

## Alternatives

- Stocker les références uniquement dans `content` : rejeté, car non requêtable et sans contrat d'intégrité.
- Déclarer automatiquement chaque décision comme vérifiée : rejeté, car la présence d'un reçu ne constitue pas une preuve de vérité.
- Exiger des preuves pour toute décision : rejeté, car les décisions provisoires doivent rester mémorisables sans être promues comme vérifiées.
