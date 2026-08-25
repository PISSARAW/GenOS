# Métamorphose — Transition Radicale d'Architecture

> **Concept biologique** : Métamorphose — changement structurel drastique (ex: chenille à papillon) pour s'adapter à une niche écologique entièrement différente.
> **Statut** : implémenté (`genos-core::biomimicry::metamorphosis`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_METAMORPHOSIS.md`

## 1. Pourquoi

### 1.1 Le problème : L'encombrement du cycle de vie
Un agent conçu pour l'exploration (Larve) a besoin d'outils de debug, de liseurs de logs, d'une grande mémoire exploratoire et de drives de curiosité. S'il est promu en production (Imago), conserver ces outils alourdit son contexte (tokens) et crée des failles de sécurité.

La biologie utilise la métamorphose pour recycler les tissus obsolètes de la larve et construire les organes de l'adulte (Imago). 

### 1.2 Bénéfices
| Bénéfice | Mécanisme |
|---|---|
| **Efficience des Tokens** | Les outils d'exploration sont "shed" (perdus), allégeant le prompt système pour la phase de production. |
| **Continuité de l'identité** | L'agent garde sa mémoire épisodique et son ID, évitant de devoir spawner un nouvel agent depuis zéro. |

## 2. Comment

Le `MetamorphosisEngine` définit 3 stades :
1. **Larval** : Spécialisé dans l'apprentissage, l'ingestion de données et la recherche.
2. **Pupal** : Stade de transition (inactif). L'orchestrateur calcule le delta entre les outils actuels et les outils de la niche cible (`compute_tissue_changes`).
3. **Imago** : Spécialisé dans l'exécution, avec un set d'outils optimisé et verrouillé.

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Orchestrateur** | Identifie qu'un agent a rempli sa mission exploratoire et invoque la transition vers le stade Pupal. Met à jour le génome de l'agent. |
| **Worker** | Au stade Pupal, l'agent se met en stase et accepte la mutation de son architecture avant de "ré-éclore" en Imago. |

## 4. API

### 4.1 CLI
```bash
genos biomimicry bio-feature --feature metamorphosis --action transition \
  --param agent_id=ag_123 \
  --param current_stage=larval \
  --param current_tool=web_search \
  --param current_tool=code_writer \
  --param target_tool=sql_executor
```
(Le système indiquera que `web_search` et `code_writer` doivent être détruits, et `sql_executor` acquis).
