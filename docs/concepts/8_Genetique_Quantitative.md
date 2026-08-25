# 8. GÉNÉTIQUE QUANTITATIVE

La génétique quantitative étudie comment plusieurs gènes influencent conjointement un trait mesurable. GenOS l'utilise pour comprendre "mathématiquement" pourquoi certains agents réussissent mieux que d'autres.

---

## 8.1 QTL (Quantitative Trait Loci) et GBLUP

### Ce que ça apporte à l'agent
Lorsqu'un agent performe bien, GenOS effectue une "cartographie causale" (map_qtl) pour trouver la corrélation statistique entre ses gènes (Loci) et ses performances (Traits). L'algorithme décompose la variance (Vp = Va + Vd + Vi + Ve).
Cela apporte **l'explicabilité et l'orientation de l'élevage**. Au lieu de faire muter les agents au hasard, GenOS sait exactement quels traits génétiques (ex: logic_strictness ou creativity) sont responsables du succès dans une tâche précise.

### Schéma Conceptuel
`mermaid
pie title "Décomposition de la Variance des Performances (Vp)"
    "Variance Additive (Gènes utiles) - Va" : 60
    "Variance Environnement (Bruit, Réseau) - Ve" : 30
    "Interaction (Épistasie) - Vi" : 10
`

### Différence par rapport aux concurrents
- **Concurrents** : L'IA agit comme une "boîte noire". Quand un prompt marche mieux, on ne sait pas mathématiquement pourquoi.
- **GenOS** : C'est une approche "Glass Box" via un pseudo-GBLUP. Le système s'analyse lui-même et identifie les causes génomiques de son intelligence.

---

## 8.2 Héritabilité (h², H²)

### Ce que ça apporte à l'agent
L'héritabilité (h²) mesure la part des performances d'un agent qui est purement due à son ADN et non à la chance (l'environnement). GenOS exige des cohortes descendantes avant de déclarer qu'un trait est héritable.
Cela apporte **la robustesse scientifique de l'évolution**. Si un agent réussit un exploit par hasard (ex: le serveur en face a répondu très vite), son h² sera faible. L'orchestrateur refusera de le cloner massivement car son succès n'est pas "dans ses gènes".

### Exemple Comparatif : Évaluer le succès d'un agent
| Type d'Agent | Analyse d'un exploit | Conséquence |
|---|---|---|
| **Agent Simple** | Réussit une tâche complexe du premier coup. | L'utilisateur pense avoir le prompt parfait, mais ça échouera la prochaine fois. |
| **Worker GenOS** | Réussit la tâche. GenOS calcule l'héritabilité en le clonant et le retestant. | Découvre que le succès était dû à l'environnement (Ve élevé). Évite un faux espoir. |
| **Orchestrateur GenOS** | Identifie un QTL fort (Va élevé) sur le gène code_linter_strictness. | Sait qu'il doit maximiser ce gène pour tous les futurs agents travaillant sur cette base de code. |
