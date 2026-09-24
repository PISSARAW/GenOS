# ADR 0067 — Succession des symbiontes Holobionte

## Statut

Accepté — dix-huitième lot du plan Holobionte.

## Contexte

Les capacités nécessaires évoluent entre planification, implémentation,
vérification, livraison et maintenance. Détruire les résidents inutiles
empêche leur réutilisation et laisse parfois leurs ressources ouvertes.

## Décision

1. Planifier les capacités requises par phase à partir des contrats actifs,
   des résidents, des candidats et des symbiontes dormants.
2. Révoquer les ressources d’un résident qui n’est plus requis puis le mettre
   en dormance dans le journal append-only.
3. Conserver les capacités absentes comme lacunes explicites et laisser les
   nouveaux candidats passer par l’admission existante.
4. Réactiver un symbionte dormant uniquement avec un contrat actif, des
   preuves nouvelles et une revue AEIS autorisée.

## Conséquences

- Les transitions de phase gardent la lignée et les contrats, sans conserver
  les allocations d’un symbionte inactif.
- La reprise est réversible et contrôlée ; une revue négative conserve la
  dormance.
- Le Host peut fournir des capacités spécifiques à son projet au lieu
  d’utiliser les valeurs par défaut de phase.

## Alternatives

- Supprimer les résidents inutiles : rejeté, car leurs niches peuvent
  redevenir nécessaires lors d’une phase ultérieure.
- Réactiver automatiquement un résident à la demande : rejeté, car la
  disponibilité passée ne démontre pas son aptitude actuelle.
