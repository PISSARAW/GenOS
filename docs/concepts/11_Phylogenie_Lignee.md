# 11. PHYLOGÉNIE & LIGNÉE

Ce document montre comment GenOS garde la trace de l'histoire évolutive de tous ses agents pour garantir une auditabilité absolue.

---

## 11.1 Arbre Phylogénétique (Clades et DAG)

### Ce que ça apporte à l'agent
Chaque agent GenOS n'apparaît pas de nulle part : il s'inscrit dans un PhylogenyTree (exportable en format standard Newick) et un graphe orienté acyclique (LineageDag). Chaque action structurante (Fork, Restore, Replay, Mutation) est typée et crée un nœud dans l'arbre.
Cela apporte **l'auditabilité parfaite et le débuggage temporel (Time-Travel)**. Si un agent détruit une base de données, l'Orchestrateur peut remonter l'arbre jusqu'au LCA (Lowest Common Ancestor - l'ancêtre commun le plus récent) déterministe, et identifier à quel moment exact la mutation fautive a été introduite.

### Schéma Conceptuel
`mermaid
flowchart TD
    Ancetre[Agent V1.0\n(Stable)] -->|Mutation A| B1[Agent V1.1\n(Testeur rapide)]
    Ancetre -->|Mutation B| C1[Agent V1.2\n(Codeur strict)]
    B1 -->|Replay| B2[B1 (Replay exact)]
    C1 -->|Fork (Mitose)| C2[Clone 1]
    C1 -->|Fork| C3[Clone 2 - Fail]
    
    style C3 fill:#ffcccc,stroke:#ff0000
    C3 -.->|Remontée au LCA| C1
`

---

## 11.2 Horloge Moléculaire

### Ce que ça apporte à l'agent
Plutôt que de mesurer le temps en millisecondes, GenOS utilise une horloge moléculaire (molecular_clock_distance) : c'est la distance euclidienne mesurée sur les gènes (loci) exprimés. Plus deux agents ont un code génétique éloigné, plus ils ont "divergé" évolutivement.
Cela apporte **une mesure de la diversité de l'essaim**. Si l'horloge montre que tous les agents sont génétiquement très proches, l'Orchestrateur sait que le système est en "consanguinité" et vulnérable à un seul et unique bug.

### Différence par rapport aux concurrents
- **Concurrents** : L'historique des agents est une simple stack trace ou un log de chat.
- **GenOS** : L'historique est une généalogie biologique mathématiquement prouvable et requêtable.
