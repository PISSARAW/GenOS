# ADR 0499 — Scoper l’invalidation des résultats

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Isolation workspace, invalidation et versionnement de résultats.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0493, dépendances complètes ; ADR 0494, scope workspace ; ADR 0497, réfutation scopée.

## Contexte

`markStale(db, id)` était exporté et mettait à jour un résultat seulement par
identifiant. Un appel direct ne portait aucune frontière de workspace. Les
appels internes partaient d'un champion scopé, mais ne transmettaient pas ce
scope à l'opération de mutation.

## Décision

`markStale` exige maintenant `id`, `semanticId` et `scopeId`. Il dérive la clé
scopée et ne passe à `STALE` qu'une ligne `VERIFIED` dont l'ID et le scope
correspondent. Les appels internes transmettent l'identité issue de la requête
déjà scopée. Un scope absent échoue fermé; un ID appartenant à un autre scope
ne change aucune ligne et retourne `false`.

## Conséquences

### Positives

- Un appel d'invalidation ne peut plus cibler une ligne d'un autre workspace
  par son ID seul.
- Les transitions invalides ne remplacent pas un état déjà `REFUTED`, `STALE` ou
  `SUPERSEDED`.
- Le test confirme la préservation du champion étranger et le refus sans scope.

### Négatives

- Les consommateurs doivent transmettre le scope autorisé avec l'identité du
  problème.
- La portée de la fonction interne ne prouve pas l'autorité du consommateur qui
  fournit ce scope; elle doit venir du contexte authentifié de la mission.

## Alternatives

- Garder la mutation par ID seul et compter sur ses seuls appels internes :
  rejeté, car l'API exportée reste appelable directement.
- Mettre à jour tout statut : rejeté, car une invalidation tardive ne doit pas
  rétrograder une ligne déjà réfutée ou remplacée.
