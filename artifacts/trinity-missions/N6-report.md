# Mission N6 — Planification multi-objectifs (temps, coût, risque, énergie)

**Verdict : RÉUSSITE (partielle, honnête)** — variant `pareto`, trois familles réellement divergentes, front de Pareto conservé car aucune famille ne domine partout.

## 1. Lancement Trinity (réel, vérifié)

- Variant : `pareto` — receipt `trinity-design-v1-7243def66c87743e`, `objectivePolicy=pareto_orthogonal`
- Workers réels : basic_implementation→bounded_worker (direct), interview_plan_implementation→specialist (structured), self_correcting_implementation→adaptive_worker (falsification)
- Replay : `node artifacts/trinity-missions/run_all.cjs --only N6`
- Exigence respectée : les trois mondes partent scellés sur des familles différentes, sans discussion préalable.

## 2. Familles indépendantes et leurs échecs

- **Famille A — scalarisation + plus court chemin (Dijkstra/A\* pondéré)** : rapide, simple, contraintes dures = filtrage d'arêtes. **Échoue** sur fronts non convexes (points Pareto inatteignables par combinaison linéaire) et biaise vers les poids choisis ; sensible aux échelles.
- **Famille B — Pareto exact (label-setting multi-objectifs, type Martins/NAMOA\*)** : garantit le front exact. **Échoue** par explosion combinatoire (labels exponentiels) sur grands graphes ; ingestion temps réel difficile.
- **Famille C — métaheuristiques (NSGA-II/MOEA) + pénalités/réparation** : passe à l'échelle, front approché, contraintes dures par réparation. **Échoue** en garanties (pas d'optimalité, stochasticité) et en auditabilité.

## 3. Algorithme proposé (justifié, pas de gagnant forcé)

1. Modéliser : graphe, 4 coûts/arête (temps, coût, risque, énergie), contraintes **dures** (ex. risque max, zones interdites) vs **objectifs**.
2. Prétraitement : filtrer les arêtes/chemins violant les dures (jamais de pénalité molle sur une dure).
3. Routage par taille : petite instance → B (exact) ; grande instance → C (NSGA-II + archive élitiste + hypervolume) avec A comme baseline rapide et comme générateur de solutions initiales pour C.
4. Sortie : **ensemble de Pareto (KEEP_PARETO_SET)** + hypervolume + genou (knee) recommandé, jamais un unique « meilleur trajet » caché.

Cas où chaque famille échoue (rappel) : A rate le non-convexe ; B explose ; C ne prouve pas. D'où l'hybridation honnête ci-dessus.

## 4. Télémétrie, schéma, étapes, budget

- Receipt : `receipts/N6.json`. Schéma : 3 familles scellées → analyse d'échec par famille → comparateur Pareto → hybridation ou front.
- Étapes : compose pareto → mapping → 3 dossiers familiaux → matrice échecs → algorithme hybride.
- Budget : 3 × 1500 tokens simulés, ~0,04 s local, 0 distant.
- Limite honnête : **partielle** — pas d'implémentation exécutée ni de benchmark (Dijkstra vs NAMOA\* vs NSGA-II sur graphe réel) ; l'hybridation est justifiée mais non mesurée. Prochaine étape : coder les trois et mesurer hypervolume/temps.
