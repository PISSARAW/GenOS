# ADR 0457 — Ingestion du routeur à la clôture worker vérifiée

## Statut

Accepté pour les missions worker dont la tentative modèle et la preuve native sont liées.

## Contexte

Le pont entre une mission et le routeur pouvait reconstruire une observation à partir du reçu worker, de l'oracle natif et de l'assemblage AEIS, mais son ingestion exigeait un appel explicite. Une mission vérifiée ne nourrissait donc pas automatiquement la décision de routage.

## Décision

Après la transaction qui scelle le reçu biologique final et marque l'observation terminale comme appliquée, `recordExecutionEvent` tente l'ingestion si le run est `completed`, si le reçu déclare le résultat vérifié et si son budget est satisfait. Le pont relit toutes les preuves persistées : contrat, observations, sortie modèle brute et empreinte, tentative mesurée, action active, attestation native et assemblage AEIS actif. Un accusé de transport ne suffit jamais à qualifier l'observation.

L'état du routeur déduplique atomiquement par assemblage AEIS et identifiant de tentative. Le raccord renvoie un statut distinct (`observed`, `duplicate`, `refused` ou `error`) dans le résultat de clôture. Une erreur d'apprentissage ne modifie ni le statut du run ni son reçu ; l'ingestion pourra être retentée à partir des preuves persistées.

## Conséquences

Le premier événement de clôture vérifié entraîne une observation qualifiée sans appel manuel. Le rejeu, y compris après redémarrage, ne compte pas deux fois. Un résultat incomplet, altéré ou non vérifié ne forme pas de label positif. Le statut d'apprentissage est une trace de l'appel de clôture ; les refus et erreurs ne constituent pas des observations persistées du routeur.
