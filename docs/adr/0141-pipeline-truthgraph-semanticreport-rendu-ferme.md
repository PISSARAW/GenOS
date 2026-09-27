# ADR 0141 — Pipeline TruthGraph → SemanticReport → rendu fermé

## Statut

Accepté.

## Décision

Le graphe de vérité est compilé en propositions canoniques avant toute
verbalisation. Une causalité n’est portée dans le rapport que par une arête
`caused_by_recorded`; une mention textuelle d’un outil reste une source, jamais
une cause. Le rendu exige qu’une phrase factuelle cite au moins un ID de
proposition connu et rejette les tags inconnus ou les claims non résolus.

Le texte de surface peut être produit par un modèle, mais il ne peut pas
ajouter de fait, de nombre, d’outil ou de cause au contrat compilé.
