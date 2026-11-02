# GQEL — Benchmark de mécanisme à réponses fixes

- **Statut** : Implémenté comme fixture déterministe ; amplification LLM réelle non qualifiée.
- **Portée** : deux scénarios et trois réponses prédéfinies par scénario.
- **Dernière revue** : 2026-11-02

Ce benchmark vérifie le calcul des scores, la progression d'une boucle et son
acceptation locale. **Il n'appelle aucun LLM.** Il ne démontre donc pas qu'un même
modèle produit de meilleures réponses grâce à GQEL.

## Protocole

Le [script](run_elevation_benchmark.cjs) définit deux scénarios : un court métrage
dramatique (`creative_writing`) et un module JavaScript (`software_engineering`).
Chacun contient trois chaînes fixes :

- A : `v1`, réponse initiale prédéfinie ;
- B : `vNaive`, révision libre prédéfinie ;
- C : exécution GQEL avec `v1`, puis `vGqelFixed` à l'itération suivante.

Le générateur C ne lit pas le prompt de réparation : il retourne la réponse
corrigée déjà écrite dans le script. Les conditions A/B évaluent directement
les textes et utilisent `evaluation.valid` comme champ `promoted`. La condition C
utilise le verdict de boucle `balanced`, avec seuil 80. Les portes d'acceptation
ainsi comparées ne sont pas identiques.

## Exécution

Depuis la racine du dépôt :

```bash
node backend/tests/test_quality_elevation_loop.js
node benchmarks/gqel-elevation/run_elevation_benchmark.cjs
```

Le benchmark écrit `benchmark_results.json` dans ce dossier. Ce fichier est une
sortie de fixture, pas un reçu de campagne LLM ni une autorisation de promotion.

## Résultats internes des fixtures

| Domaine | A : initiale | B : révision prédéfinie | C : boucle GQEL | Delta C − A |
| --- | --- | --- | --- | --- |
| Écriture créative | 0/100, 8 défauts, invalide | 15/100, 7 défauts, invalide | 100/100, 0 défaut, acceptée en 2 tours | +100 points |
| JavaScript | 75/100, 2 défauts, valide | 90/100, 1 défaut, valide | 100/100, 0 défaut, acceptée en 2 tours | +25 points |

Ces scores mesurent la conformité à des heuristiques. L'évaluateur logiciel
compile la syntaxe mais n'exécute pas les tests du candidat ; les marqueurs
créatifs ne constituent pas une appréciation artistique indépendante. Les
résultats ne permettent pas de comparer l'efficacité réelle de la révision libre
et de GQEL sur un modèle.

## Dossier et qualification restante

Voir le [concept](../../docs/01-concepts/gqel.md),
[l'intégration](../../docs/02-orchestration/gqel.md),
la [référence](../../docs/03-reference/gqel-boucle-elevation-qualite.md),
le [runbook](../../docs/04-exploitation/gqel.md) et
[l'état des preuves](../../docs/06-qualite-preuves/qualification-gqel-2026-11-02.md).
Ce dernier définit le protocole restant : générations réelles, modèle constant,
budgets comparables, corpus réservé, oracles externes et conservation des échecs.
