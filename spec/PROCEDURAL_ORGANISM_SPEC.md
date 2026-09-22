# Procedural Organism Specification (v1)

## Statut et portée

Cette spécification définit le format canonique **Procedural Organism** v1 : la représentation persistante, versionnée et interopérable d'un organisme procédural GenOS, capable de porter structure, plasticité, épigénétique, immunité, écologie, fitness, lignée et preuve.

- Format **JSON** canonique (sérialisable SQLite/MessagePack).
- Normatif côté Node.js par les types de `backend/src/services/procedural*Service.js`.
- Interopérable avec les services existants via les hashes canoniques (structureHash/stateHash/versionId).

## Non-objectifs

- Ne remplace pas les services individuels (plasticity, pruning, etc.) — il les coordonne.
- Ne définit pas les politiques d'exécution (leases, sandbox) — il les référence.
- N'encode pas de fonctions JavaScript (closures) — uniquement des données.

## Objet canonique

```yaml
apiVersion: genos/v1alpha1
kind: ProceduralOrganism

metadata:
  id: "po-abc123"              # versionId = SHA256(parentId + structureHash + stateHash + mutationSignature)
  version: 5                    # incrémenté à chaque mutation (entier >= 1)
  parentId: "po-abc120"         # null pour les génomes initiaux
  lineageId: "lineage-debug-1"
  structureHash: "9f2c..."      # SHA256 du squelette canonique (nodes + synapses)
  stateHash: "7b1e..."          # SHA256 de l'état canonique (weights + phenotype + immune + fitness + plasticity)
  mutationSignature: "c48a..."  # SHA256 des opérations canoniques de la mutation
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
| `metadata.id` | string | `versionId` = SHA256(parentId + structureHash + stateHash + mutationSignature) |
| `metadata.version` | integer | version incrémentée à chaque mutation (entier ≥ 1) |
| `metadata.structureHash` | string | SHA256 du squelette canonique (nodes + synapses, triés) |
| `metadata.stateHash` | string | SHA256 de l'état canonique (weights + phenotype + immune + fitness + plasticity) |
| `metadata.mutationSignature` | string | SHA256 des opérations canoniques de la mutation |
| `structure.nodes` | array | nœuds du graphe procédural |
| `structure.synapses` | array | arêtes plastiques avec poids et preuve |

## Identité et versioning

L'identité d'un organisme est **composée** : le squelette, l'état et la lignée
participent tous à `metadata.id`.

```
structureHash     = SHA256(canonical(nodes, synapses))          — identité du squelette
stateHash         = SHA256(canonical(weights, phenotype,        — identité de l'état
                                   immune, fitness, plasticity))
mutationSignature = SHA256(canonical(operations))               — empreinte de la mutation
metadata.id       = versionId = SHA256(parentId + structureHash
                                       + stateHash + mutationSignature)
```

Implémentation de référence : `backend/src/services/proceduralIdentityService.js`
(`structureHash`, `stateHash`, `versionId`, `sealOrganism`).

Cela garantit :
- **Reproductibilité** : même graphe + même état + même lignée → même id.
- **Séparation structure/état** : deux organismes au squelette identique mais
  d'état différent (poids, épigénétique) ont des ids distincts.
- **Versioning** : toute mutation (structurelle ou d'état) change le hash.
- **Traçabilité** : l'id encode le parent — une phylogénie est vérifiable.

## Scellement (DRAFT → SEALED)

Un variant généré par `generateVariants()` est un **DRAFT** : il ne porte
**aucun** champ d'identité (`id`, `version`, `structureHash`, `stateHash`,
`mutationSignature` sont absents de ses métadonnées). Un draft n'est pas un
organisme valide au sens du validateur.

Le scellement (`sealCandidate(parent, variant, evaluation)` dans
`proceduralMutationSelectionService.js`, ou `sealOrganism(organism)` dans
`proceduralIdentityService.js`) produit le **SEALED** :

```
metadata.parentId          = parent.metadata.id
metadata.version           = parent.metadata.version + 1
metadata.mutationSignature = SHA256(operations)
metadata.structureHash     = recomputé
metadata.stateHash         = recomputé
metadata.id                = versionId(...)
```

`validateOrganism()` est **pur** : il vérifie `metadata.structureHash` et
`metadata.stateHash` contre les valeurs recalculées (invariant
cryptographique), sans jamais les réparer. Un hash déclaré erroné —
typiquement un hash hérité du parent — est détecté comme mismatch.

## Sémantique du graphe

La validité **structurelle** (schema) ne suffit pas : un graphe schema-valide
peut être non exécutable. La validité **sémantique**
(`proceduralGraphSemanticsService.validateGraphSemantics()`, séparée du
validator de schema) exige :

- **Entrée** : le premier nœud de `structure.nodes` est l'entrypoint.
- **Sortie** : tout nœud `type: "terminal"` est atteignable depuis l'entrypoint.
- **Gates obligatoires** : tout nœud `type: "gate"` avec `required: true` est
  atteignable depuis l'entrypoint.
- **Accessibilité** : tous les nœuds sont accessibles depuis l'entrypoint
  (un nœud orphelin `B → TERMINAL` sans chemin depuis l'entrée est invalide).
- **Terminals sans sortie** : un nœud terminal n'a pas de synapse sortante
  (vers un nœud existant ou `DIRECT_TERMINAL`).

Un graphe `START → A` avec `B → TERMINAL` où B est inaccessible est donc
**schema-valide mais sémantiquement invalide** : la procédure n'est pas
exécutable.

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
- nouveau `metadata.id` (versionId recomposé)
- `metadata.version` incrémenté
- `metadata.parentId` = ancien id

## Références

- `docs/01-concepts/procedural-organism.md` — documentation conceptuelle
- `docs/08-philosophie.md` — section 27 (ontologie)
- `spec/AGENT_DNA_SPEC.md` — format ADN agentique (inspiration)
- `spec/genome.schema.json` — schéma genome (inspiration)
