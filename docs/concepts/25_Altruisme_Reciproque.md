# 25. ALTRUISME RÉCIPROQUE

Inspiré de l'évolution et de l'éthologie, ce mécanisme explique comment et pourquoi les agents GenOS s'entraident sans autorité centrale.

---

## 25.1 Titre-pour-Titre (Tit-for-Tat)

### Ce que ça apporte à l'agent
Dans la théorie des jeux, l'altruisme réciproque est une stratégie gagnante. Dans GenOS, un agent possède un "budget d'altruisme". Si l'Agent B demande de l'aide à l'Agent A, A va dépenser de son temps de calcul (Tokens) pour l'aider, à condition que B soit d'une lignée jugée "coopérative".
Cela apporte **l'équilibrage de la charge par le mérite**. Les agents ne floodent pas le réseau de demandes inutiles, car chaque demande "coûte" en capital de confiance. Un agent "parasite" qui demande toujours de l'aide sans jamais réussir de tâches verra son score chuter et ne sera plus aidé.

### Schéma Conceptuel
```mermaid
flowchart TD
    A[Agent A\n(Développeur bloqué)] -->|Demande Aide| B[Agent B\n(Expert dispo)]
    B -->|Consulte Registre Confiance| C{A est-il fiable ?}
    C -->|Oui| D[B dépense des tokens pour aider A]
    D -->|A réussit| E[Le score de confiance de A et B augmente]
    C -->|Non (Parasite)| F[Refus d'aide]
```
### Exemple Comparatif
| Type d'Agent | Interaction | Résultat |
|---|---|---|
| **Agents Experts (Swarm classique)** | Tous les agents répondent à toutes les demandes (Broadcast). | Les coûts LLM explosent. Bruit constant. |
| **Workers GenOS** | Utilisent l'Altruisme Réciproque. | Le système s'autorégule : les agents performants s'aident mutuellement (cercles vertueux), les agents défaillants sont isolés et finissent par faire l'objet d'apoptose. |
