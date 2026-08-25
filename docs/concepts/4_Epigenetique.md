# 4. ÉPIGÉNÉTIQUE

Ce document détaille la couche épigénétique de GenOS. Si le génome est le "matériel" (hard-coded), l'épigénétique est le "logiciel" : elle modifie comment les gènes s'expriment en fonction de l'expérience et du contexte, sans altérer le code source initial.

---

## 4.1 Marqueurs Épigénétiques

### Ce que ça apporte à l'agent
Chaque locus possède un epigenetic_marker qui vient moduler l'expression de base du gène. L'intérêt majeur est la **dissipation héréditaire** : lorsqu'un agent se reproduit, ce marqueur est transmis mais atténué (ex: multiplié par 0.7).
Cela apporte une **mémoire transgénérationnelle à court terme**. Si une génération d'agents a souffert d'un environnement instable (stress élevé), ses enfants naîtront "sur le qui-vive" (expression modifiée), mais s'ils grandissent dans un environnement sain, ce trait s'estompera au fil des générations.

### Schéma Conceptuel
`mermaid
flowchart TD
    G[Gène de Prudence\nValeur = 0.5] --> E1(Expression = 0.8)
    M1[Marqueur Épigénétique de Stress\nValeur = +0.3] --> E1
    
    subgraph Reproduction
    E1 -.->|Transmission atténuée x0.7| M2[Marqueur Enfant\nValeur = +0.21]
    end
    
    G2[Gène Enfant\nValeur = 0.5] --> E2(Expression = 0.71)
    M2 --> E2
`

### Cas d'usage
- **Adaptation rapide d'essaim** : Un essaim attaque une API qui rate-limit. Les premiers agents échouent, développent un marqueur épigénétique de lenteur, et leurs successeurs héritent de cette lenteur "par prudence" avant même d'avoir touché l'API.

---

## 4.2 Chromatine / Méthylation / Histones (Architecture)

### Ce que ça apporte à l'agent
Dans GenOS, l'ADN textuel (les instructions) peut être "ouvert" (Euchromatine) ou "condensé" (Hétérochromatine) via un ChromatinVector.
L'euchromatine est injectée dans le prompt actif du LLM. L'hétérochromatine est masquée du prompt (gain massif de tokens, de 60 à 80% du préfill), mais reste disponible en mémoire O(1) si l'agent en a soudainement besoin.
Cela apporte **l'efficience économique absolue**. L'agent a accès à une encyclopédie de compétences, mais ne paie (en tokens) que pour la page qu'il est en train de lire.

### Différence par rapport aux concurrents
- **Concurrents** : Doivent choisir entre un prompt gigantesque (très cher, lent, dilution d'attention) ou un RAG classique (risqué, recherche sémantique incertaine).
- **GenOS** : L'agent "condense" les instructions qu'il n'utilise pas actuellement et les "décondense" à la volée.

---

## 4.3 Lamarckisme / Héritage des Acquis

### Ce que ça apporte à l'agent
Contrairement à la biologie darwinienne pure, GenOS autorise l'héritage Lamarckien (transmission d'un caractère acquis pendant la vie de l'agent). Via des mutations DPO (Direct Preference Optimization) sur des trajectoires validées, l'agent réécrit son propre génome avant de se reproduire.
Cela apporte **la capitalisation immédiate de l'expérience**. Si un agent découvre une faille géniale, il l'inscrit dans son ADN et la transmet à ses enfants, accélérant drastiquement la convergence de l'essaim.

### Exemple Comparatif : Résolution d'un labyrinthe algorithmique
| Type d'Agent | Action / Apprentissage | Résultat génération suivante |
|---|---|---|
| **Agent Simple** | LLM classique, trouve la sortie après 10 erreurs. | Repart de zéro à la prochaine exécution. |
| **Agent Expert** | Sauvegarde sa solution dans une base vectorielle. | Doit faire une requête de recherche pour s'en souvenir, risque d'halluciner la réponse. |
| **Worker GenOS** | Utilise le Lamarckisme pour modifier son exploration_drive en fonction des impasses qu'il a rencontrées. | S'il est cloné, son clone ne fera pas les mêmes erreurs car son ADN a intégré l'expérience. |
| **Orchestrateur GenOS** | Récupère la trajectoire du Worker, applique une LamarckianMutation. | Transforme une astuce découverte par hasard en un trait génétique stable pour tout le futur essaim. |

---

## 4.4 Paysage Épigénétique de Waddington

### Ce que ça apporte à l'agent
C'est le concept de "canalisation". Un agent naît "pluripotent" (généraliste). Plus il avance dans une tâche, plus il "roule dans une vallée" du paysage de Waddington, verrouillant certains gènes et devenant un hyper-spécialiste (engagé). Il gagne en efficacité mais perd en flexibilité.
