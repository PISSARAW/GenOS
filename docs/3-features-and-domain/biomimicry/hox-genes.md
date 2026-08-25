# Gènes Hox & Colinéarité — Architecture Cognitive

> **Concept biologique** : Gènes Hox (gènes architecturaux) déterminant le plan d'organisation le long de l'axe antéro-postérieur, avec colinéarité entre la position sur le chromosome et l'ordre d'expression.
> **Statut** : implémenté (`genos-core::biomimicry::hox_genes`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_HOX_GENES.md`

## 1. Pourquoi

### 1.1 Le problème : Architecture anarchique
Lors du boot d'un agent complexe ou d'un essaim, si les capacités sont activées dans le désordre (ex: activer la mémoire avant d'avoir défini l'identité, ou activer les outils d'action avant le raisonnement), l'agent se retrouve dans un état « malformé ». Il peut agir avant de réfléchir.

La biologie empêche cela grâce aux gènes architecturaux (Gènes Hox) : leur ordre sur le chromosome impose l'ordre strict de construction de l'organisme.

### 1.2 Bénéfices
| Bénéfice | Mécanisme |
|---|---|
| **Plans d'organisation reproductibles** | Garantit que tous les agents d'une classe ont une architecture fiable. |
| **Prévention des malformations cognitives** | Le module vérifie la colinéarité de l'activation et bloque tout agent qui outrepasse l'ordre. |

## 2. Comment

Le `HoxBlueprint` définit des segments (Anterior, Thorax, Posterior).
- **Anterior** : Capacités fondamentales (identité, parseurs).
- **Thorax** : Logique centrale (raisonnement, MCTS).
- **Posterior** : Actionneurs et mémoires (Outils MCP, RAG).

L'ordre temporel d'activation des modules au runtime *doit* correspondre à l'ordre défini par le Blueprint. 

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Orchestrateur** | Applique le Blueprint lors du déploiement d'une nouvelle architecture d'agent. Vérifie la colinéarité (`biomimicry_hox_verify`) lors des tests CI/CD. |
| **Worker** | Les workers ne manipulent pas leurs gènes Hox, c'est une contrainte structurelle. |

## 4. API

### 4.1 CLI
```bash
genos biomimicry bio-feature --feature hox --action verify \
  --param activated=identity \
  --param activated=reasoning \
  --param activated=mcp_tools
```
(Si l'on passe `mcp_tools` *avant* `reasoning`, la CLI remonte une violation de colinéarité).
