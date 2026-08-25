# 32. RPE DOPAMINERGIQUE (Reward Prediction Error)

GenOS intègre la mécanique fondamentale de l'apprentissage par renforcement biologique : l'erreur de prédiction de la récompense (Dopamine).

---

## 32.1 Apprentissage par RPE

### Ce que ça apporte à l'agent
Quand un agent entreprend une action, il émet une prédiction sur le succès attendu. 
- Si le succès est **supérieur** à la prédiction (surprise positive) $\rightarrow$ Spike de Dopamine. L'agent renforce violemment le chemin neuronal (STDP) qui a mené à cette solution.
- Si le succès est **conforme** à la prédiction $\rightarrow$ Dopamine nulle. L'agent sait qu'il maîtrise le sujet, pas besoin de réapprendre.
- Si le succès est **inférieur** $\rightarrow$ Creux de Dopamine (dépression synaptique).

Cela apporte **un apprentissage concentré uniquement sur l'inconnu**. L'agent ne gaspille pas de ressources à se féliciter d'avoir réussi une tâche basique. Il n'apprend que de ses surprises, maximisant l'usage des tokens pour les vraies nouveautés.

### Schéma Conceptuel
`mermaid
xychart-beta
    title "Sécrétion de Dopamine (RPE) selon le Résultat"
    x-axis ["Échec Surprise", "Succès Prévu (Routine)", "Succès Surprise (Eurêka)"]
    y-axis "Niveau de Dopamine" -1.0 --> 1.0
    bar [-0.8, 0.0, 0.9]
`

### Exemple Comparatif
| Type d'Agent | Face à un succès routinier | Impact |
|---|---|---|
| **Agent Classique (RLHF)** | Le système met à jour ses poids à chaque réussite. | Surapprentissage (Overfitting), oubli catastrophique des cas rares. |
| **Worker GenOS** | Le RPE est de 0 (succès prévu). Aucune modification génétique ou synaptique. | Stabilité garantie. Les capacités d'apprentissage sont réservées aux vrais problèmes. |

