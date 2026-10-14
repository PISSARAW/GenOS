# ADR 0506 — Rapporter le statut après invalidation

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : État versionné, invalidation et vérité des résultats de cache.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0499, invalidation scopée ; ADR 0500, revalidation des preuves ; ADR 0502, propagation des erreurs DB.

## Contexte

Lorsqu'un reçu était invalide, que le résultat expirait ou que ses dépendances
changeaient, `lookupReusable` persistait `STALE` mais retournait encore l'objet
chargé avant l'UPDATE, dont le statut restait `VERIFIED`. Un appelant pouvait
donc observer un miss accompagné d'un faux statut positif.

## Décision

Tous les chemins qui marquent un champion `STALE` retournent une copie au statut
`STALE` après une mise à jour réussie. Si la mise à jour n'a pas touché la ligne,
le service relit le champion dans son scope et retourne son état courant.

## Conséquences

### Positives

- Le statut retourné après un miss reste cohérent avec l'état persistent.
- Le test couvre l'invalidation par reçu et par dépendance; la branche d'expiration
  utilise le même helper.

### Négatives

- Un conflit concurrent déclenche une relecture supplémentaire pour rapporter
  l'état le plus récent.

## Alternatives

- Retourner l'objet pré-update : rejeté, car il présente un résultat invalidé
  comme vérifié.
- Ne retourner aucun objet sur miss : rejeté, car l'appelant peut encore utiliser
  le statut et la raison pour expliquer la non-réutilisation.
