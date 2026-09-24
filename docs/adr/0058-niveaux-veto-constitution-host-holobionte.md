# ADR 0058 — Niveaux de veto et garde constitutionnelle du Host Holobionte

## Statut

Accepté — neuvième tranche de fondation Holobionte.

## Contexte

Un veto de politique et un invariant constitutionnel n'ont pas la même
autorité. Le Host doit rester sous l'autorité SYSTEM/USER ; une approbation
humaine peut traiter un veto de politique, mais ne peut pas effacer une
limite inscrite dans la constitution.

## Décision

1. Charger la constitution persistée du Host et vérifier la révision de session
   avant toute décision.
2. Refuser toute autorité demandée au-dessus de `HOST` et toute décision qui
   touche un invariant non négociable.
3. Faire examiner chaque décision par l'Immune Plane AEIS.
4. Permettre l'override d'un veto de politique uniquement avec une signature
   HMAC valide SYSTEM/USER, récente et liée à l'identifiant de décision ainsi
   qu'au hash du résultat.
5. Enregistrer chaque override autorisé par un événement `IMMUNE_OVERRIDE`.

## Conséquences

- Un override de politique devient explicite, signé et auditable.
- Un override ne peut jamais neutraliser un veto constitutionnel ; le Host doit
  d'abord obtenir un amendement approuvé qui produit une nouvelle constitution.
- Les invariants sont identifiés explicitement dans la décision. La détection
  sémantique automatique de toutes les violations potentielles reste à fournir
  par les gates métier.

## Alternatives

- Utiliser la même approbation pour les deux niveaux : rejeté, car cela
  transformerait une limite constitutionnelle en simple préférence.
- Laisser le Host lever un veto sans approbation signée : rejeté, car l'acteur
  contrôlé pourrait s'auto-autoriser.
