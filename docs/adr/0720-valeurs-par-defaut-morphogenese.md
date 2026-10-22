# ADR 0720 — Valeurs par défaut de la configuration Morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : Morphogenèse, configuration, seuils par défaut
- **Décideurs** : GenOS
- **Lié à** : ADR 0045, ADR 0049, ADR 0076, ADR 0081

## Contexte

Le module Morphogenèse expose un `MorphogeneticConfig` (documenté à `docs/02-orchestration/topologies/morphogenese.md` §12) dont plusieurs paramètres reposent sur des constantes en dur sans justification écrite :

| Paramètre | Valeur par défaut | Lieu de définition |
|-----------|-------------------|--------------------|
| `defaultTopology` | `Trinity` | `backend/src/services/morphogenesis/roles/morphogeneticController.js` (`DEFAULT_CONFIG.defaultTopology`) |
| `overcommitRatio` | `1.5` | `backend/src/services/morphogenesis/barriers/budgetBarrier.js` (`DEFAULT_OVERCOMMIT_RATIO`) |
| `memoryRetention` | `30 days` | `backend/src/services/morphogenesis/memory/morphologyPriorFreshness.js` (`DEFAULT_HALF_LIFE_MS = 30 * 86400000` ms) et `roles/morphologyMemory.js` |
| `firewallPolicy` | `STRICT` | `backend/src/services/morphogenesis/firewalls/firewallTypes.js` (`DEFAULT_FIREWALL_POLICY`) et `roles/informationFirewallManager.js` |

Avant cet ADR, aucun commentaire de code ni test ne justifiait le choix de ces valeurs précises, et il existait une incohérence entre la documentation (`STRICT` en §12 vs `'STANDARD'` dans l'exemple §17.4) et le code.

## Décision

Les valeurs par défaut suivantes sont figées et documentées comme telles :

1. **`defaultTopology = Trinity`** : topologie de comparaison d'hypothèses (trois mondes, expérience contrôlée). C'est le choix le plus « neutre » pour un nœud dont la topologie n'est pas spécifiée, car Trinity ne privilégie ni l'exploitation ni l'exploration exclusive ; elle force une comparaison contradictoire avant toute promotion.

2. **`overcommitRatio = 1.5`** : le budget global effectif est `globalBudget × 1.5`. Une marge de 50 % absorbe les pics de demande transitoires sans refuser immédiatement les contrats, tout en maintenant une borne dure qui empêche la sur-allocation unbounded (1,2 trop serré, 2,0 trop permissif).

3. **`memoryRetention = 30 days`** : half-life de décroissance des priors morphologiques (`30 * 86400000` ms). Un mois représente un cycle d'observation suffisant pour qu'un prior perde de sa confiance sans être purgé prématurément, tout en évitant l'accumulation indéfinie d'entrées obsolètes.

4. **`firewallPolicy = STRICT`** : la politique par défaut des pare-feux informationnels est `STRICT`. L'exemple de code `InformationFirewallManager` est corrigé pour utiliser `constructor(policy = 'STRICT')` afin d'aligner l'implémentation sur la documentation (voir `morphogenese.md` §12 et §17.4).

Ces valeurs sont des **défauts révisables** : elles peuvent être overriden par configuration explicite au niveau d'un nœud ou d'une mission, et doivent être révisées si la charge de production, les métriques de regret ou les incidents de budget le justifient.

## Conséquences

### Positives

- Chaque constante dispose désormais d'une trace écrite justifiant son choix numérique.
- L'incohérence `STRICT` (doc) vs `STANDARD` (exemple de code) est résolue au profit de `STRICT`, cohérent avec la posture fail-closed du système.
- Les valeurs restent overridables par configuration explicite, préservant la souplesse opérationnelle.

### Négatives

- Aucun des quatre choix n'est étayé par des mesures de production ; ils reposent sur une inférence d'ingénierie, pas sur des benchmarks. Ils doivent être considérés comme des hypothèses à valider.
- Les commentaires justificatifs et constantes canoniques sont portés directement par `budgetBarrier.js`, `morphologyPriorFreshness.js`, `firewallTypes.js`, `morphogeneticController.js`, `informationFirewallManager.js` et `morphologyMemory.js`.

## Alternatives

- **Laisser les valeurs sans justification** : rejeté, car toute décision influençant l'architecture mérite un ADR et des commentaires de code (AGENTS.md, `docs/CONVENTIONS.md`).
- **Choisir d'autres valeurs** (ex. `overcommitRatio = 2.0`, `memoryRetention = 7 days`) : rejeté pour l'instant, faute de données de production justifiant un changement ; les valeurs actuelles sont conservées mais désormais documentées.
- **Documenter uniquement dans le doc** : rejeté, insuffisant ; le code source doit porter le raisonnement à proximité des constantes.

## Mise en œuvre

1. `budgetBarrier.js` exporte `DEFAULT_OVERCOMMIT_RATIO = 1.5` avec justification commentée et validation stricte des ratios.
2. `morphologyPriorFreshness.js` exporte `DEFAULT_HALF_LIFE_MS = 30 * 86400000` ms et `roles/morphologyMemory.js` applique `DEFAULT_MEMORY_RETENTION_DAYS = 30` et `DEFAULT_MAX_ENTRIES = 10000`.
3. `firewallTypes.js` et `roles/informationFirewallManager.js` exposent `DEFAULT_FIREWALL_POLICY = 'STRICT'` (aligné sur `morphogenese.md` §12 et §17.4).
4. `roles/morphogeneticController.js` expose l'intégralité du `MorphogeneticConfig` (`defaultTopology = 'Trinity'`, `overcommitRatio = 1.5`, `memoryRetention = 30`, `firewallPolicy = 'STRICT'`, `timescaleConfig`).
5. Réviser ces valeurs après une période d'observation en production ou sur incident de budget/mémoire.
