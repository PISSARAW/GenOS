# 12. DIVISION CELLULAIRE

Comment les agents GenOS se multiplient (scale-out) pour affronter la charge, en s'inspirant des modes de division biologique.

---

## Ce que ça apporte à l'agent
GenOS propose plusieurs stratégies de réplication selon le besoin de sécurité ou de rapidité.
*Attention : certains de ces modules sont actuellement à l'état de spécifications dans le code source.*

1. **Mitose** (mitotic_fork_capsules) : Duplication stricte. Les clones subissent un vote majoritaire (consensus) validé au bit près (byte-for-byte). Si un clone diverge (hallucination LLM), il est éliminé par la majorité. Idéal pour les tâches critiques.
2. **Bourgeonnement (Budding)** : Un agent délègue un sous-problème à un sous-agent. Une **limite de Hayflick** (ex: 8 divisions) l'empêche de créer des sous-agents à l'infini (évitant les fuites de mémoire et explosions de coûts d'API).
3. **Schizogonie** : "Fan-out" spéculatif atomique. Un agent se scinde instantanément en N agents pour tester N hypothèses en parallèle.
4. **Amitose** : Refusée volontairement par le design GenOS. C'est la division sans vérification. (Ce que font les scripts Python classiques quand ils threadent des LLMs).

### Schéma Conceptuel (Bourgeonnement et Limite de Hayflick)
`mermaid
flowchart LR
    A[Agent Principal\nDivisions restantes : 8] -->|Bourgeonnement| B[Sous-agent\nDivisions : 7]
    B -->|Bourgeonnement| C[Sous-agent\nDivisions : 6]
    C -.->|...| D[Sous-agent final\nDivisions : 0]
    D -.->|Division interdite| X((Arrêt))
`

### Exemple Comparatif : Résolution récursive d'un arbre de dépendances
| Type d'Agent | Comportement | Résultat |
|---|---|---|
| **Agent Simple** | Boucle récursive "while True". | Dépassement de capacité (Stack Overflow) ou explosion du budget tokens. |
| **Worker GenOS** | Bourgeonne des sous-agents pour chaque dépendance. | Atteint la limite de Hayflick. L'orchestrateur est alerté que l'arbre est trop profond et stoppe le gouffre financier avant qu'il ne s'emballe. |
