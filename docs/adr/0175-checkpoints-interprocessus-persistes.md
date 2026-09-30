# ADR 0175 — Checkpoints interprocessus persistés

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Communication, persistance
- **Décideurs** : GenOS
- **Lié à** : [ADR 0116](0116-execution-fiable-communication.md)

## Contexte

Les checkpoints communicationnels étaient en mode `shadow` par défaut. Le pont
stigmergique savait écrire dans `signal_blobs`, mais pouvait aussi retourner un
blob local-only, qui ne traverse pas les processus.

## Décision

1. Le mode checkpoint est `active` par défaut ; `GENOS_COMMUNICATION_MODE=shadow`
   permet une exécution sans publication.
2. Un dépôt STIGMERGY n'est annoncé comme exécuté que lorsque sa persistance
   SQLite a réussi. Un blob local-only retourne `PERSISTENCE_REQUIRED`.
3. Les autres garde-fous de transport, notamment la validation de l'audience des
   signaux ligand, restent en vigueur.
4. Le comportement est une simulation logicielle déterministe et bornée. Il ne
   revendique ni imagination ni propriété biologique.

## Conséquences

### Positives

- Les checkpoints compatibles peuvent être lus par d'autres processus via la
  base partagée.
- Les reçus distinguent un dépôt durable d'une donnée locale non partagée.

### Négatives

- Une panne ou l'absence de base empêche de déclarer un dépôt STIGMERGY réussi.
- Les communications checkpoint actives peuvent publier des signaux ; le mode
  `shadow` reste disponible pour les exécutions sans effet.

## Alternatives

- Garder `shadow` par défaut : rejeté pour cette activation explicite.
- Accepter les blobs locaux comme succès : rejeté, car cela donnerait une fausse
  garantie interprocessus.
