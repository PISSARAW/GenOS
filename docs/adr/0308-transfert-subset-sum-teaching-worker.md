# ADR 0308 — Transfert contrôlé de subset_sum par le teaching worker

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, transmission, vérification
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0307

## Contexte

Le `teaching_worker` produisait un paquet de formation, mais aucune voie
native ne reliait l'enseignement à une procédure exécutée ni ne contrôlait
le transfert sur une réponse de l'apprenant.

## Décision

La méthode `teach_subset_sum` exécute la procédure bornée `subset_sum`,
fournit une démonstration et des étapes fixes, puis vérifie que les indices
proposés sont distincts, présents dans l'entrée et totalisent la cible.
Le paquet conserve le reçu de procédure et le verdict de transfert.

## Conséquences

Un cas de transfert est mesurable sans inférence de modèle. Un paquet avec
un échec de contrôle reste un résultat de transmission, pas une preuve de
maîtrise. Le contrôle porte sur une seule instance fournie ; il ne prouve
ni compréhension générale, ni rétention, ni efficacité pédagogique face
à un système concurrent.

## Alternatives

- Déclarer le transfert réussi parce que le paquet a été produit : rejeté,
  car la réponse de l'apprenant doit être vérifiée.
- Déduire une compétence générale d'un seul témoin : rejeté ; le verdict
  reste propre à cette instance et à ces indices.
