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
| `defaultTopology` | `Trinity` | doc §12 ; code : fallback `'default'` / `'single_agent'` selon les sélecteurs |
| `overcommitRatio` | `1.5` | `backend/src/services/morphogenesis/barriers/budgetBarrier.js#L3` |
| `memoryRetention` | `30 days` | `backend/src/services/morphogenesis/memory/morphologyPriorFreshness.js#L8` (`30 * 86400000` ms) |
| `firewallPolicy` | `STRICT` | doc §12 ; exemple de code `InformationFirewallManager` utilise `constructor(policy = 'STANDARD')` (§17.4) |

Aucun commentaire de code, aucun ADR et aucun test ne begründe le choix de ces valeurs précises. De plus, il existe une incohérence : le doc annonce `STRICT` alors que l'exemple de code `InformationFirewallManager` (`morphogenese.md` §17.4, ligne 1148) default sur `'STANDARD'`, et il n'existe pas de constante `DEFAULT_FIREWALL_POLICY` dans `backend/src/services/morphogenesis/firewalls/`.

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
- L'ajout de commentaires dans `budgetBarrier.js`, `morphologyPriorFreshness.js` et le contrôleur morphogénétique est nécessaire pour que la justification survive à la lecture du code (hors du périmètre de cet ADR, cf. étapes de mise en œuvre).

## Alternatives

- **Laisser les valeurs sans justification** : rejeté, car toute décision influençant l'architecture mérite un ADR et des commentaires de code (AGENTS.md, `docs/CONVENTIONS.md`).
- **Choisir d'autres valeurs** (ex. `overcommitRatio = 2.0`, `memoryRetention = 7 days`) : rejeté pour l'instant, faute de données de production justifiant un changement ; les valeurs actuelles sont conservées mais désormais documentées.
- **Documenter uniquement dans le doc** : rejeté, insuffisant ; le code source doit porter le raisonnement à proximité des constantes.

## Étapes de mise en œuvre (hors ADR)

1. Ajouter un commentaire de justification dans `budgetBarrier.js` (`DEFAULT_OVERCOMMIT_RATIO = 1.5`).
2. Ajouter un commentaire de justification dans `morphologyPriorFreshness.js` (`30 * 86400000` ms).
3. Aligner `InformationFirewallManager` (doc §17.4) sur `policy = 'STRICT'` et ajouter un commentaire dans le module de firewalls concerné.
4. Mettre à jour `morphogenese.md` §12 : remplacer la colonne « Description » par une justification réelle pour `overcommitRatio`, `memoryRetention` et `firewallPolicy`.
5. Réviser ces valeurs après une période d'observation en production ou sur incident de budget/mémoire.
