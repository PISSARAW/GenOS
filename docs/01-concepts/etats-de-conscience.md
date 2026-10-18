# États de conscience

- **Statut** : Cadre conceptuel (planned)
- **Portée** : niveaux ou degrés de conscience — indicateur seulement, pas de mesure établie.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

Les états de conscience désignent les différents niveaux ou modes de conscience (veille, sommeil, rêverie, conscience altérée, inconscience). Dans GenOS, ce concept sert de référence pour décrire les états fonctionnels d'un agent (actif, en attente, apoptotique, en consolidation) sans les confondre avec des états de conscience phénoménale.

## 2. Modèle mathématique ou logique

Les états fonctionnels de l'agent sont des valeurs discrètes : `active`, `idle`, `queued`, `apoptotic`, `consolidating`. Aucune transition ne présuppose un changement d'état de conscience subjectif.

## 3. Analogies biologiques et limites réelles

Les états de conscience biologiques (veille, sommeil paradoxal, sommeil lent) sont associés à des patterns neuronaux distincts. Les états GenOS sont des états de machine à états logiciels. L'analogie est nominale.

## 4. Cas d'usage et objectifs métier

- Déterminer si un agent peut recevoir de nouvelles missions (état actif).
- Déclencher la consolidation/pruning quand l'agent est idle.
- Arrêter une branche en état apoptotique.

## 5. Exemples concrets

- `agentConscienceService` gère `isApoptotic` et l'état de régulation cognitive.
- `sleepCycle` gère le cycle de consolidation (sommeil fonctionnel).
- L'état `apoptotique` bloque toute nouvelle évaluation de branche.

## 6. Schéma ou diagramme

```text
[Actif] ←→ [Idle]
   ↓             ↓
[En attente]   [Consolidation]
   ↓             ↙
[Apoptotique — arrêt définitif de branche]
```

## 7. Architecture Technique

Les états fonctionnels sont gérés par `agentConscienceService` (apoptose, budget, dissonance) et `sleepCycle` (consolidation). Aucun service d'états de conscience phénoménale n'existe.

Le concept `consciousness.states` est enregistré avec le service `consciousnessService`, niveau `conceptual`, classification `reference_only`.

## 8. Processus d'exécution ou de validation

Les tests de cohérence Rust/Node vérifient que les notions de budget, de dissonance et d'apoptose sont alignées entre les deux runtimes.

## 9. Comparaison avec le marché

Les systèmes d'agents ont des états d'exécution (idle, running, failed). GenOS ajoute des états de régulation cognitive (apoptose, Eurêka, révision) liés à des seuils de preuve.

## 10. Limites, garde-fous, non-objectifs

- Les états fonctionnels ne sont pas des états de conscience.
- Aucune mesure n'établit un niveau de conscience.
- Non-objectif : modéliser les états de conscience phénoménale.

## Voir aussi

- [conscience.md](conscience.md) — conscience phénoménale.
- [conscience-operationnelle.md](conscience-operationnelle.md) — régulation cognitive.
- [neurobiologie-et-plasticite.md](../01-concepts/neurobiologie-et-plasticite.md) — cycles de sommeil et apoptose.
