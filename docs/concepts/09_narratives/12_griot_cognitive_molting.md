# Mue Cognitive (Cognitive Molting) & Pléiotropie

## Le Problème (Sénescence et Homogénéisation)
Lorsque vous sollicitez continuellement un modèle local (ex: Ollama/LM Studio) pour générer des dizaines d'articles d'affilée, deux phénomènes de "fatigue" apparaissent :
1. **Saturation du KV Cache** : Le contexte s'alourdit en VRAM. Le modèle devient paresseux, raccourcit ses réponses, ou boucle.
2. **Homogénéisation Stylistique (Endogamie)** : Même en changeant les "personas" (ex: écrire comme 5 auteurs différents), la matrice probabiliste de base du modèle impose un style récurrent. 

## La Solution Biomimétique : La Mue (Ecdysis)
Dans GenOS, l'Orchestrateur implémente une **Mue Cognitive**. À chaque changement majeur de contexte (ex: un nouvel auteur dans la A-Team), l'Orchestrateur demande au routeur de "changer de peau" en basculant physiquement sur un **autre modèle local** (ex: passer de Llama-3 à Mistral, puis à Qwen).

### L'Architecture (variantIndex)
Le `modelRouter.js` détecte tous les modèles locaux disponibles (`localModelDiscovery.js`).
L'Orchestrateur passe un incrément `variantIndex` à chaque changement de tâche :
```javascript
let selectedModel = sorted[variantIndex % sorted.length];
```
- Auteur 1 (variantIndex 1) -> Modèle A
- Auteur 2 (variantIndex 2) -> Modèle B
- Auteur 3 (variantIndex 3) -> Modèle C

Cette rotation purge mathématiquement le problème de KV Cache (puisqu'on change de moteur d'inférence) et garantit une hétérogénéité stylistique absolue.

## Pléiotropie (Mue Défensive)
Le Système Immunitaire Cognitif (qui gère l'auto-correction via `withImmunity`) utilise aussi cette Mue comme mécanisme de survie (**Pléiotropie**). 
Si le Modèle A hallucine et échoue à valider le JSON à l'Essai 1, le Système Immunitaire incrémente le `variantIndex` pour l'Essai 2. L'erreur est ainsi envoyée à un Modèle B (un "cerveau" différent) qui n'est pas embourbé dans la même matrice de probabilités, maximisant les chances de guérison du format.

```mermaid
graph TD
    T[Tâche] --> I[Immune System (Essai 1)]
    I --> M1(Modèle Llama)
    M1 -->|Erreur JSON| I
    I -->|Pléiotropie (Essai 2)| M2(Modèle Qwen)
    M2 -->|Succès| O[Output Valide]
```

## Divergence Cognitive (Consanguinité Zéro)
Ce mécanisme est également mis à la disposition de tout Orchestrateur pour simuler de multiples "Personas".
Le cas d'usage typique est le **Pair-Programming** ou le **Peer-Review**. 

Si un Modèle A (Dev) écrit du code, il a ses propres "angles morts" cognitifs (biais algorithmiques). Si vous utilisez ce même Modèle A pour "Reviewer" son propre code, il passera souvent à côté de ses propres bugs.

En exposant le `variantIndex` à tous les agents, l'Orchestrateur peut appliquer une **Divergence Cognitive** :
- Agent Rédacteur (Dev) : `variantIndex = 0` (ex: Llama-3)
- Agent Critique (Reviewer) : `variantIndex = 1` (ex: Mistral)

En croisant deux matrices probabilistes différentes, on assure une qualité de review bien supérieure, tout comme deux humains pensant différemment trouveront plus de failles ensemble.

