# GenOS Agent-Native Tests

Cette suite de tests a pour but de valider expérimentalement l'efficacité de la couche d'abstraction **Agent-Native** (Knowledge, Intent, State) pour les différents modèles d'IA (Griot, Orchestrateurs MCP et CLI). 

Le principe est de fournir pour un même problème logiciel (concept) deux requêtes de nature différente :
1. **Prompt Humain :** Vague, émotionnel, sans métriques précises.
2. **Prompt Agent :** Structuré, strict, provenant souvent d'un log technique ou d'un processus automatisé.

## Liste des Tests

| ID | Dossier | Concept Biologique (GenOS) | Problème Logiciel | Statut |
|---|---|---|---|---|
| 1 | [`test1/`](./test1/) | Apoptose (Apoptosis) / Gestion Mémoire | Fuite mémoire (Memory Leak) / OOM_KILLER | ✅ Validé |
| 2 | *À venir* | Biomimétisme / Flocking (Nuée) | Concurrence réseau / Deadlock BDD | - |
