# ADR 0293 — Persistance des états de variants Metapopulation

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Metapopulation, cycles régionaux, dèmes persistants et culture
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0291, ADR 0288

## Contexte

Les politiques de variants pouvaient émettre des marqueurs de cycle, de mémoire de dème ou
de culture sans que leur état survive à un redémarrage. Un marqueur de transport ne prouve
pas qu'une mutation, une transmission ou une récupération a réellement été persistée.

## Décision

Le runtime stocke les états de cycle vérifiés, la mémoire et la fitness des dèmes, ainsi
que les cultures et leurs transmissions dans des tables SQLite liées à la session et aux
dèmes. Les cultures portent une version, un hash du contenu et un parent éventuel ; un
identifiant existant avec un contenu différent est refusé. Une transmission enregistrée
exige des dèmes résidents et une compatibilité attestée. La phylogénie est reconstruite
depuis les liens parentaux persistés.

Chaque exécuteur doit relire la donnée persistée avant de valider son marqueur. Une action
absente, un résultat seulement déclaratif ou une preuve manquante bloque la validation du
cycle. Les tables ne modifient pas l'autorité des gates de promotion.

## Conséquences

- Positif : les variants disposent de données durables pour reprendre un cycle et vérifier
  les mutations ou transmissions après exécution.
- Négatif : les anciennes cultures uniquement en mémoire ne sont pas rétroactivement
  transformées en preuves persistées ; elles doivent être enregistrées explicitement.
- Les tests de chaque variant doivent couvrir son action, sa lecture SQLite et son refus
  lorsque l'état ou la preuve manque.

## Alternatives

- Conserver les marqueurs en mémoire : rejeté, car leur présence était perdue au redémarrage.
- Déduire un succès du seul rapport worker : rejeté, car le rapport ne démontre pas la
  mutation ou la transmission effective.
