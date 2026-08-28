# 16. MORPHOGENÈSE

L'étude de la façon dont les structures complexes émergent de règles locales simples.

---

## 16.1 Motifs de Turing et Information Positionnelle

### Ce que ça apporte à l'agent
Comment une équipe d'agents décide-t-elle sans chef "qui fait quoi" ? GenOS utilise des **Gradients de Morphogènes** (Information de Wolpert) et des **équations de Réaction-Diffusion** (Alan Turing).
Un agent qui devient "Leader" émet un signal "Activateur" (demande d'aide) et un signal "Inhibiteur" (empêche les autres de devenir Leader trop près de lui). Ce ratio auto-stabilise l'essaim à environ 1 Leader pour 4 Workers (rôle Explore / Exploit / Idle).
Cela apporte une **auto-organisation pure (Zero Central Bottleneck)**. L'Orchestrateur n'a même pas besoin de micro-manager ; l'équipe se structure chimiquement d'elle-même.

### Schéma Conceptuel
```mermaid
flowchart TD
    A[Agent A (Devient Leader)] -->|Émet Inhibiteur| B[Agent B]
    A -->|Émet Inhibiteur| C[Agent C]
    B -->|Inhibé| B_Role[Devient Worker (Exploit)]
    C -->|Inhibé| C_Role[Devient Worker (Exploit)]
    D[Agent D (Hors de portée de l'Inhibiteur)] -->|Se sent seul| D_Role[Devient Leader]
```