# 21. INTELLIGENCE COLLECTIVE / ÉTHOLOGIE

Comment des agents simples, en suivant des règles basiques, produisent une intelligence de groupe supérieure.

---

## 21.1 Stigmergie (Phéromones) et Eusocialité (Castes)

### Ce que ça apporte à l'agent
Plutôt que d'envoyer des messages directs très verbeux (Pub/Sub lourd), les agents GenOS utilisent la **Stigmergie**. Ils déposent des "phéromones" (Recrutement, Alarme) dans un "SpatialMesh" (un tableau noir virtuel). Les phéromones s'évaporent avec le temps.
L'essaim s'organise selon des Castes (Reine, Ouvrière, Soldat) comme le rat-taupe nu, ou selon des modèles de "Nuées" (séparation, alignement, cohésion). 

Cela apporte une **collaboration silencieuse et peu coûteuse**. Des centaines d'agents peuvent travailler sur le même projet sans se paralyser par des réunions (synchronisation).

### Schéma Conceptuel (Stigmergie)
`mermaid
flowchart TD
    A[Agent A (Trouve un bug majeur)] -->|Dépose| P[Phéromone d'Alarme (Intensité 100)]
    P -.->|Temps (Évaporation)| P2[Phéromone (Intensité 50)]
    P2 -->|Attire| B[Agent B (Passe à proximité du fichier)]
    B -->|Renforce| Action[Correction du Bug]
`

### Exemple Comparatif : Mobilisation sur un problème
| Type d'Agent | Communication | Impact |
|---|---|---|
| **Agents Experts** | "Bonjour B, pourrais-tu m'aider sur le fichier X ?" (100 tokens par message). | Le réseau sature si 50 agents communiquent, les coûts explosent. |
| **Orchestrateur GenOS** | Laisse les Workers utiliser la stigmergie. | Le Worker A dépose 1 octet (phéromone) sur le fichier X. Les autres Workers "sentent" le gradient. L'action est coordonnée avec un coût réseau proche de Zéro. |
