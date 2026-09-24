# ADR 0057 — Plan immunitaire AEIS obligatoire pour Holobionte

## Statut

Accepté — huitième tranche de fondation Holobionte.

## Contexte

Les essais d'admission et les reçus de contribution ont leurs propres règles de
validation, mais ils ne doivent pas remplacer le plan immunitaire épistémique
AEIS existant. Un contrôle local parallèle divergerait de ses politiques,
signaux et décisions.

## Décision

1. Faire passer chaque essai d'admission et chaque contribution avant
   enregistrement par `immuneSymbiontReview` de l'AEIS.
2. Conserver dans l'attestation du trial et dans le ledger le résultat résumé
   de l'inspection AEIS.
3. Si l'AEIS bloque un résultat de résident, ne pas écrire de contribution au
   ledger et ajouter un événement `IMMUNE_REJECTION`.
4. Si l'AEIS bloque un candidat, ne pas l'admettre ; le mettre en quarantaine
   avec la décision immunitaire jointe à l'événement.
5. Ne pas autoriser l'inhibition du régulateur à neutraliser un blocage de
   l'AEIS dans ces chemins Holobionte.

## Conséquences

- L'admission et l'enregistrement longitudinal ne peuvent plus contourner le
  contrôle AEIS.
- Le service AEIS courant peut produire des statuts de challenge et des erreurs
  de vérificateur ; cette tranche bloque les rejets explicites, tandis que la
  validation indépendante des résultats reste portée par l'attestation et les
  exigences de preuves du contrat.
- Les chemins d'exécution et de promotion hors des services Holobionte devront
  être raccordés pour garantir une couverture globale de l'orchestrateur.

## Alternatives

- Réutiliser seulement `immuneSystem.chaperoneAgentOutput` : rejeté, car ce
  contrôle de sortie n'est pas le pipeline adaptatif AEIS.
- Laisser le Host annuler un rejet immunitaire dans le même chemin : rejeté,
  car un blocage AEIS doit rester effectif ici.
