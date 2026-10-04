# ADR 0301 — MsgPack sans repli JSON illisible

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Transport binaire, communication inter-agents, compatibilité
- **Décideurs** : GenOS
- **Lié à** : [ADR 003x](003x-communication-ecology.md), [ADR 0299](0299-capsule-prompt-utf8-direct.md)

## Contexte

Les signaux non textuels utilisent MsgPack dans un BLOB SQLite. Lorsqu'un objet
ne pouvait pas être encodé par MsgPack, `packBioPolymer` écrivait à la place les
octets UTF-8 d'un JSON. `unpackBioPolymer` traitait pourtant tout BLOB comme
MsgPack : ce repli pouvait rendre le message illisible après persistance.

## Décision

L'écriture refuse explicitement les valeurs que MsgPack ne sait pas encoder,
avec `BIOPOLYMER_PACK_FAILED`. Le lecteur accepte les BLOB JSON historiques
commençant par `{` ou `[` et conserve la lecture des chaînes JSON historiques.
Les nouveaux BLOB non textuels restent MsgPack.

Le choix d'un format binaire n'est pas une preuve de réduction des tokens du
modèle ; il concerne le transport et le stockage de données structurées.

## Conséquences

- Un échec de sérialisation ne peut plus devenir une publication apparemment
  réussie mais illisible.
- Les BLOB JSON issus de l'ancien repli restent lisibles.
- Les valeurs non représentables en MsgPack doivent être corrigées à la source.
