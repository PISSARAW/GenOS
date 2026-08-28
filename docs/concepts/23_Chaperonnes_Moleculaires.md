# 23. CHAPERONNES MOLÉCULAIRES

Les protéines chaperonnes aident les autres protéines nouvellement synthétisées à acquérir leur bonne forme 3D. GenOS applique ce concept à la structuration de la donnée.

---

## 23.1 Repliement Actif de la Donnée

### Ce que ça apporte à l'agent
Les LLMs génèrent parfois du JSON malformé, du Markdown cassé, ou du code avec des espaces en trop. Une Chaperonne GenOS intercepte l'output brut de l'agent et tente de le "replier" correctement (forcer le parsing, fermer les accolades manquantes) avant de rejeter l'output avec une erreur.
Cela apporte **une tolérance aux pannes de formatage**. Plutôt que de forcer l'agent à dépenser de précieux tokens pour relire et corriger un JSON cassé (ce qui stresse l'agent), la chaperonne algorithmique fait le travail déterministe gratuitement.

### Schéma Conceptuel
```mermaid
flowchart TD
    LLM[Agent LLM] -->|Output JSON brut\navec syntaxe cassée| Chap(Chaperonne Moléculaire)
    Chap -->|Tentative de Repliement\n(Fix JSON)| V{Valide ?}
    V -->|Oui| Out[Output Propre exploitable]
    V -->|Non| Rej[Rejet au Checkpoint]
```
### Exemple Comparatif : Récupération d'un JSON
| Type d'Agent | Problème (Accolade manquante) | Résultat |
|---|---|---|
| **Agent Simple** | JSON parse error. | Arrêt brutal. |
| **Worker GenOS** | L'agent LLM est imprécis, mais la Chaperonne est présente au niveau du réseau. | La chaperonne ferme l'accolade, valide le schéma, l'exécution continue sans que le LLM n'ait été sollicité à nouveau. |
