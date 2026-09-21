# Procedural Organism Specification (v1)

## Statut et portée

Cette spécification définit le format canonique **Procedural Organism** v1 : la représentation persistante, versionnée et interopérable d'un organisme procédural GenOS, capable de porter structure, plasticité, épigénétique, immunité, écologie, fitness, lignée et preuve.

- Format **JSON** canonique (sérialisable SQLite/MessagePack).
- Normatif côté Node.js par les types de `backend/src/services/procedural*Service.js`.
- Interopérable avec les services existants via contentHash.

## Non-objectifs

- Ne remplace pas les services individuels (plasticity, pruning, etc.) — il les coordonne.
- Ne définit pas les politiques d'exécution (leases, sandbox) — il les référence.
- N'encode pas de fonctions JavaScript (closures) — uniquement des données.

## Objet canonique

```yaml
apiVersion: genos/v1alpha1
kind: ProceduralOrganism

metadata:
  id: "po-abc123"              # contentHash du graphe canonique
  version: 5                    # incrémenté à chaque mutation
  parentId: "po-abc120"         # null pour les génomes initiaux
  lineageId: "lineage-debug-1"
  createdAt: "2026-09-21T..."
  updatedAt: "2026-09-21T..."

structure:
  nodes:
    - id: "inspect"
      type: "action"
      required: true
    - id: "reproduce"
      type: "action"
    - id: "patch"
      type: "action"
  synapses:
    - from: "inspect"
      to: "reproduce"
      type: "excitatory"
      weight: 1.38
      plasticity:
        potentiationCount: 17
        depressionCount: 2
      evidence:
        successRate: 0.91
        trialCount: 20
      lastActivation:
        trajectoryId: "T-718"
        at: "2026-09-21T10:30:00Z"
        episode: 42
      lastUsageEpisode: 42
      lifecycle: "active"
    - from: "reproduce"
      to: "patch"
      type: "inhibitory"
      weight: 0.5
      condition:
        missing_reproduction: true
      plasticity:
        potentiationCount: 0
        depressionCount: 3
      evidence:
        successRate: 0.2
        trialCount: 10
      lifecycle: "weakened"

phenotype:
  expression: 0.9
  epigeneticMarks:
    development:
      expression: 1.0
    staging:
      expression: 0.5
    production:
      expression: 0.0
  methylation:
    - target:
        type: "synapse"
        from: "patch"
        to: "deploy"
      type: "repression"
      strength: 0.93
      trigger:
        environment: "production"
      origin:
        policy: "HIGH_RISK_DEPLOYMENT"

plasticity:
  state: "adaptive"
  lastEpisode: 42

immune:
  signatures:
    - id: "sig-xyz789"
      structuralPattern:
        operations:
          - REMOVE_REQUIRED_GATE
      affectedCapabilities:
        - PROMOTION_GATE
      response:
        gate: "REJECT"
        strength: 1.0

ecology:
  niche:
    id: "niche-python-debug"
    environment:
      language: python
      taskType: debugging
    fitness: 0.92
  populationId: "pop-debug-1"
  biomeId: "biome-main"

fitness:
  score: 0.85
  components:
    success: 0.91
    robustness: 0.72
    evidence: 0.95
    generalization: 0.68
    cost: 0.41
    risk: 0.03
    complexity: 0.52
  weights:
    success: 0.3
    robustness: 0.2
    evidence: 0.2
    generalization: 0.1
    cost: 0.08
    risk: 0.07
    complexity: 0.05
  history:
    - { episode: 40, score: 0.75 }
    - { episode: 41, score: 0.80 }
    - { episode: 42, score: 0.85 }

lineage:
  parent: "po-abc120"
  descendants: ["po-abc124", "po-abc125"]
  mutations:
    - { episode: 41, operations: ["ADD_EDGE"], hash: "po-abc124" }
    - { episode: 42, operations: ["ADJUST_WEIGHT"], hash: "po-abc125" }

evidence:
  provenance:
    - { episode: 40, trajectory: "T-715", outcome: "success" }
    - { episode: 41, trajectory: "T-716", outcome: "success" }
    - { episode: 42, trajectory: "T-718", outcome: "success" }
  contentHash: "abc123def456"
```

## Champs requis

| Champ | Type | Description |
|-------|------|-------------|
| `apiVersion` | string | `genos/v1alpha1` |
| `kind` | string | `ProceduralOrganism` |
| `metadata.id` | string | contentHash du graphe canonique |
| `metadata.version` | integer | version incrémentée à chaque mutation |
| `structure.nodes` | array | nœuds du graphe procédural |
| `structure.synapses` | array | arêtes plastiques avec poids et preuve |

## Identité et contentHash

L'`metadata.id` est un **contentHash** du graphe canonique (structure seule, sans état mutable).

```javascript
function contentHash(organism) {
  const canonical = {
    nodes: organism.structure.nodes.sort((a, b) => a.id.localeCompare(b.id)),
    synapses: organism.structure.synapses.sort((a, b) => 
      `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)
    ).map(s => ({ from: s.from, to: s.to, type: s.type })),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}
```

Cela garantit :
- **Reproductibilité** : même graphe → même hash.
- **Dé-duplication** : deux organismes identiques ont le même id.
- **Versioning** : toute mutation structurelle change le hash.

## Cycle de vie

```
Création
  ↓
Execution (action selection)
  ↓
Outcome observé
  ↓
Prediction error δ
  ↓
LTP ou LTD (plasticité)
  ↓
Consolidation (sleep/replay)
  ↓
Mutation (si surprise > seuil)
  ↓
Immune inspection
  ↓
Causal trials + fitness
  ↓
Promotion gate
  ↓
Promu ou Rejeté
  ↓
    ↓                    ↓
 héritage          immune memory
```

## Versioning

- `version` incrémente à chaque mutation structurelle.
- `parentId` pointe sur la version précédente.
- `lineage` conserve l'historique complet (phylogénie).

## Immutabilité

Les objets `ProceduralOrganism` sont **immutables** une fois persistés.
Toute mutation crée un nouveau objet avec :
- nouveau `metadata.id` (contentHash)
- `metadata.version` incrémenté
- `metadata.parentId` = ancien id

## Références

- `docs/01-concepts/procedural-organism.md` — documentation conceptuelle
- `docs/08-philosophie.md` — section 27 (ontologie)
- `spec/AGENT_DNA_SPEC.md` — format ADN agentique (inspiration)
- `spec/genome.schema.json` — schéma genome (inspiration)
