# ADR 0497 — Scoper la réfutation et effacer le champion

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Isolation workspace, invalidation et pointeur de champion.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0494, scope workspace ; ADR 0495, atomicité des promotions ; ADR 0496, reçu de vérification.

## Contexte

`refuteResult` modifiait uniquement par identifiant de ligne. Un appelant
possédant ou devinant un ID pouvait donc changer un résultat d'un autre workspace.
En outre, réfuter un champion laissait `request_problems.champion_result_id`
pointé vers une ligne `REFUTED`.

## Décision

La réfutation exige le scope et le `semanticId`; le service recalcule la clé
scopée et conditionne l'UPDATE à cette clé. L'écriture du statut et l'effacement
du pointeur du champion s'effectuent dans une transaction. Une clé hors scope
ne modifie aucune ligne et retourne `false`; un scope absent échoue fermé.

## Conséquences

### Positives

- Un workspace ne peut pas modifier par cette API le statut d'un résultat d'un
  autre workspace.
- Une réfutation réussie ne laisse pas le problème annoncer un champion réfuté.
- Le test couvre le refus inter-workspace, la réfutation dans le bon scope et
  la suppression du pointeur.

### Négatives

- Les consommateurs de l'API doivent porter le scope autorisé et le semantic ID
  du résultat. Aucun appelant de production n'est raccordé aujourd'hui.
- La méthode lie la portée d'accès; elle ne qualifie pas à elle seule l'autorité
  de l'émetteur de la réfutation ni la preuve du contre-exemple.

## Alternatives

- Garder l'identifiant de ligne comme seul critère : rejeté, car il ne porte
  aucune frontière de workspace.
- Laisser le pointeur vers le résultat réfuté : rejeté, car l'état du problème
  contredirait celui de son champion.
