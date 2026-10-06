# ADR 0332 - Adaptateur expérimental OpenHands SDK

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : workers développeurs, ontogenèse

## Décision

Une tâche bornée peut être transmise au SDK OpenHands dans un espace de travail
explicitement choisi. L'appelant impose un délai ; le processus enfant
n'obtient aucune capacité de promotion GenOS. Son résultat est un candidat à
tester et à relire par les mécanismes de preuve habituels.

## Limites

Le garde de chemin ne confine pas les commandes terminal du SDK. Une sandbox
système indépendante est obligatoire avant tout essai non fiable. Sans modèle
configuré, seul le contrat de l'adaptateur est vérifié par les tests locaux.
