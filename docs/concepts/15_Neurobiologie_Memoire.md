# 15. NEUROBIOLOGIE & MÉMOIRE

Ce document explique comment GenOS modélise la mémoire et l'apprentissage à l'échelle des "synapses" (les liens entre les concepts manipulés par l'agent).

---

## 15.1 Plasticité STDP (Spike-Timing-Dependent Plasticity)

### Ce que ça apporte à l'agent
En neurobiologie, "les neurones qui s'activent ensemble se lient ensemble", mais *l'ordre temporel* compte (STDP). Dans GenOS, le renforcement de la mémoire (pply_stdp) suit cette règle temporelle causale : si le concept A amène souvent à la solution B, le lien causal est renforcé (LTP). Si l'inverse se produit, il est affaibli (LTD). 
Cela apporte **un raisonnement causal robuste**. L'agent ne fait pas que mémoriser des faits pêle-mêle ; il construit un graphe de connaissances orienté. Si A $\rightarrow$ B fonctionne, la route synaptique est optimisée.

### Schéma Conceptuel
```mermaid
flowchart LR
    A[Recherche 'NullPointerException'] -->|Avant| B[Trouve 'Fichier config']
    B -->|Renforcement STDP (LTP)| C[Solution Validée]
    A -.->|Après STDP, Lien ultra-rapide| C
```
---

## 15.2 Nociception (Douleur)

### Ce que ça apporte à l'agent
La nociception est la perception de la douleur. GenOS implémente un canal (Nociceptor) qui capte les "douleurs" algorithmiques (erreurs critiques, crashs, exceptions non gérées).
Cela apporte un **réflexe de survie immédiat**. L'agent n'a pas besoin de "réfléchir" à l'erreur (ce qui consomme des tokens). Le nocicepteur court-circuite le LLM et déclenche immédiatement un processus d'Apoptose pour préserver le système.

### Exemple Comparatif
| Type d'Agent | Face à une erreur critique récurrente | Conséquence |
|---|---|---|
| **Agent Simple** | Tente d'analyser l'erreur textuellement. | Hallucine des causes probables, perd du temps et de l'argent. |
| **Worker GenOS** | Le Nocicepteur s'active. La "douleur" dépasse le seuil tolérable. | Court-circuit du cerveau (LLM) : l'agent s'arrête, signale le danger à l'Orchestrateur, et meurt. Zéro token gâché. |
