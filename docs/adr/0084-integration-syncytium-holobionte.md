# ADR 0084 — Intégration de Syncytium au Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, Syncytium, cohérence, sous-topologies
- **Décideurs** : GenOS
- **Lié à** : ADR 0076, ADR 0078

## Contexte

Des symbiontes très couplés partagent parfois un état continu et une cohérence
commune. Les intégrer séparément au Host exposerait une composition qui fonctionne
comme une seule unité.

## Décision

L'adaptateur charge une session Syncytium réellement persistée, exige au moins deux
membres déclarés, des capacités et des preuves. Il crée un candidat Holobionte de
kind `SUB_TOPOLOGY`, topologie `syncytium`, avec l'identifiant de session, la
révision de cohérence et un hash de l'état partagé. Le candidat doit ensuite passer
par le contrat et l'admission Holobionte; le pont n'autorise pas lui-même les
mutations Syncytium.

## Conséquences

### Positives

- L'unité intégrée pointe vers l'état Syncytium persisté plutôt qu'une copie.
- La cohérence partagée est rattachée à une révision et à un hash.
- Les gates du Host restent applicables avant toute intégration résidente.

### Négatives

- Les membres et capacités doivent être décrits par l'appelant.
- Le hash ne remplace pas les preuves de comportement et de gouvernance.

## Alternatives

- Créer un symbionte séparé par membre : rejeté pour les groupes où la cohérence
  commune est une propriété essentielle.
