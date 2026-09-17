# ADR 0020 — Moteurs logiques bornés et sémantiques explicites

- Statut : Accepté
- Domaine : Philosophie, inférence, épistémologie

## Décision

Les logiques sont exposées comme des adaptateurs analytiques bornés. Chaque
résultat indique sa sémantique, ses hypothèses et ses limites. Une analyse
réussie ne constitue ni une preuve du monde réel ni une promotion de claim.

La logique propositionnelle classique est le premier moteur exécutable. Les
logiques modale, déontique, dynamique et non classique réutilisent des modèles
explicitement fournis par l’appelant. La métalogique et les paradoxes restent
comparatifs tant qu’aucun prouveur certifié n’est disponible.

## Conséquences

- les valeurs de vérité ne sont pas réduites à un booléen unique ;
- les contre-modèles et les contradictions sont conservés ;
- une analogie philosophique ne peut pas produire une permission runtime ;
- chaque évolution d’un moteur doit ajouter des tests de limites.
