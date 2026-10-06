# ADR 0328 — Cycle standard GVX vérifié et reprenable

- Statut : Accepté
- Date : 2026-10-06

## Contexte

Le contrôleur avait des callbacks obligatoires sans implémentation standard. Le crédit précédait le monitoring et une retransmission ne reprenait pas les étapes interrompues.

## Décision

Fournir un adaptateur standard borné aux politiques de mécanismes AGOW. Le service externe Ed25519 charge des profils opérateur épinglés par SHA-256, exécute leurs évaluateurs fixes dans des processus à environnement minimal et conserve les mesures signées. Le candidat est une politique déclarative, jamais le code du vérificateur.

L'application exige une autorisation externe liée au scope et aux hashes. Elle conserve une opération préparée avant la mutation, applique par comparaison atomique et restaure le parent exact. Les leases SQLite sérialisent les cycles et le crédit ; le journal conserve les étapes et permet la reprise.

Le crédit positif suit trois fenêtres indépendamment vérifiées, avec contextes distincts. Les valeurs, échantillons, suites, contrôles et identités proviennent des mesures exécutées. Le service vérifie en lecture seule l’opération appliquée et la politique actuelle dans la base runtime avant les mesures de suivi et avant l’émission du crédit. Les preuves de suivi lient application et observation ; une application ne peut créditer une nouvelle décision. La consolidation reste soumise à trois reçus réussis distincts.

Pour une séparation de comptes Linux, les profils peuvent exiger un UID/GID d'évaluation distinct ; le mode obligatoire vérifie aussi les permissions de la clé privée. Sous Windows, ce mode échoue fermé et exige un service ou hôte d'évaluation adapté. Le mode par défaut est réservé aux évaluateurs fixes de confiance ; un processus à environnement minimal ne constitue pas une sandbox OS pour du code hostile.

## Conséquences et preuves

Les chemins standard incluent application, surveillance, rollback, reprise après interruption et rejet d'artefacts falsifiés ou réutilisés. La commande de validation est `node backend/bin/test-gvx.cjs`.

Les fixtures sont des tests fonctionnels. Elles ne qualifient aucune tâche métier, n'exécutent aucun modèle LLM et ne constituent pas une campagne empirique. La sélection de profils, l'approbation opérateur et la qualification des tâches restent explicites.

Voir [profil d'exécution](../02-orchestration/profil-execution-gvx.md) et [service externe](../05-securite-gouvernance/service-verificateur-gvx.md).
