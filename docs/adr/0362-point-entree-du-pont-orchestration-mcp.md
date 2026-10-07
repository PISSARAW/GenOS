# ADR 0362 — Exécuter le pont d’orchestration MCP et préserver ses échecs

- **Statut** : accepté.
- **Date** : 2026-10-07.

## Contexte

Le script `backend/bin/genos-orchestrate.cjs` ne lançait plus sa fonction principale après une extraction antérieure. Un processus pouvait se terminer avec le code 0 et une sortie vide sans exécuter l’action demandée. Les routes MCP d’orchestration étaient alors seulement apparentes.

## Décision

Restaurer le point d’entrée en avant-plan et en arrière-plan, la fermeture de la base et la propagation des échecs. Les deux auxiliaires de mission (raccourci minimal et morphogenèse) sont séparés pour respecter la limite de taille du fichier. Une erreur de lecture ou de contrôle ne marque pas une mission existante en erreur ; le nettoyage de mission reste réservé aux actions qui exécutent effectivement une mission.

## Conséquences et limites

Un test lance le script sur une base jetable, relit le parent persisté et vérifie qu’une organisation inconnue échoue sans empoisonner le parent. Ce test ne prouve pas la fin d’une mission autonome, la livraison d’une notification à l’utilisateur, ni un effet externe. Les réponses `accepted` des missions en arrière-plan restent des accusés de réception.
