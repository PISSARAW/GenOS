# ADR 0050 — Constitution de l'hôte Holobionte

## Statut

Accepté — deuxième tranche de fondation.

## Contexte

La session persistante identifie le Host, mais la politique qui borne son
autorité n'est pas encore formalisée. Une constitution doit protéger les
invariants non négociables et distinguer une décision opérationnelle d'un
amendement de politique.

## Décision

1. Définir une constitution versionnée rattachée à un `hostId`, qui porte
   objectifs, invariants, règles de confidentialité, tolérance au risque,
   exigences de preuves, capacités essentielles et plafond de dépendance.
2. Borne d'autorité fixe : le Host agit au niveau `HOST` et ne peut exercer les
   niveaux `SYSTEM` ou `USER`.
3. Une décision Host qui touche un invariant non négociable est refusée. Un
   changement de constitution exige un approbateur `SYSTEM` ou `USER`, une
   raison, et produit une nouvelle révision.
4. Persister la constitution dans la projection de session et écrire chaque
   mise à jour comme événement `CONSTITUTION_UPDATED`.

## Conséquences

- Les sessions disposent d'un contrat vérifiable pour les décisions Host.
- Les ajustements de politiques sont explicites et traçables par le journal.
- Le stockage dédié aux constitutions partagées entre sessions, la transmission
  et la résolution automatique des écarts de capacités restent hors de cette
  tranche.

## Alternatives

- Laisser les invariants dans le prompt Host : rejeté, car l'application ne
  pourrait pas tester leur respect avant une décision.
- Permettre à Host d'amender seul sa constitution : rejeté, car cela rendrait
  ses limites d'autorité contournables.
