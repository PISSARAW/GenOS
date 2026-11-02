# GQEL — État des preuves au 2 novembre 2026

- **Statut** : Qualification partielle des mécanismes ; amplification LLM réelle non démontrée par le benchmark GQEL.
- **Portée** : code Node.js, suite de mécanisme et deux scénarios à réponses fixes.
- **Dernière revue** : 2026-11-02

Le [concept](../01-concepts/gqel.md), le [guide d'intégration](../02-orchestration/gqel.md),
la [référence](../03-reference/gqel-boucle-elevation-qualite.md) et le
[runbook](../04-exploitation/gqel.md) décrivent le dossier. Ce rapport distingue
les mécanismes testés des bénéfices qui nécessitent une campagne réelle.

## Sources et protocole local

Révision de départ de cette revue : `7445f75b3eb4424bc8497b96c91214358924e13e`,
avec des modifications préexistantes dans le checkout ; ce hash ne décrit donc
pas à lui seul tous les fichiers présents. Sources principales :

- [Service de boucle](../../backend/src/services/qualityElevation/qualityElevationService.js).
- [Évaluateurs](../../backend/src/services/qualityElevation/qualityEvaluatorRegistry.js),
  [comparaison](../../backend/src/services/qualityElevation/qualityComparisonService.js)
  et [stagnation](../../backend/src/services/qualityElevation/qualityStagnationDetector.js).
- [Suite GQEL](../../backend/tests/test_quality_elevation_loop.js).
- [Script du benchmark](../../benchmarks/gqel-elevation/run_elevation_benchmark.cjs)
  et [résultat présent dans le dépôt](../../benchmarks/gqel-elevation/benchmark_results.json).

Commandes reproductibles depuis la racine :

```bash
node backend/tests/test_quality_elevation_loop.js
node benchmarks/gqel-elevation/run_elevation_benchmark.cjs
```

Le second script écrit son résultat JSON à côté du script. Il ne lance aucun
fournisseur de modèles : `v1`, `vNaive` et `vGqelFixed` sont des chaînes définies
dans son code. Dans la condition GQEL, le générateur retourne V1 puis la réponse
corrigée prédéfinie, sans exploiter le prompt de réparation.

## Matrice des preuves

| Propriété | Preuve disponible | Limite |
| --- | --- | --- |
| Compilation des politiques et surcharges | Assertions `fast`, `critical`, seuil personnalisé | Aucune calibration empirique des politiques |
| Évaluation créative | Texte sans structure refusé, texte structuré accepté | Marqueurs textuels, aucune notation artistique indépendante |
| Évaluation logicielle | Syntaxe invalide et motif shell détectés, exemple propre accepté | Les tests du candidat ne sont pas exécutés par l'évaluateur |
| Réparation et gain local | Deux réponses fixes, passage à une seconde version et gain de score | Le générateur n'apprend pas à réparer |
| Comparaison et stagnation | Défauts résolus et signature persistante testés | Pas de preuve générale d'absence de régression ou de budget strict |
| Contrôle worker | Contrat créatif invalide rejeté ; absence de contrat autorisée | Pas de mission réelle complète qualifiée par ce test |
| Obligation A-Team | Critère non vérifié produit `pending_repair` et refus | Pas d'exécution de réparation automatique ni scellement AEIS |
| Double aveugle et critiques multiples | Champs du contrat, fonction de cohérence distincte | Non exécutés par la boucle |
| Historique et reprise | Tableaux en mémoire et digests | Pas de journal durable ou de reprise transactionnelle native |

## Résultats des fixtures

Les valeurs ci-dessous proviennent du résultat JSON référencé. Les étiquettes
« génération unique », « révision libre » et « GQEL » désignent ici trois jeux
de réponses fixes, pas trois conditions LLM réellement exécutées.

| Domaine | Réponse initiale | Révision libre prédéfinie | Réponse corrigée GQEL | Gain interne | Itérations GQEL |
| --- | --- | --- | --- | --- | --- |
| `creative_writing` | 0/100, 8 défauts, invalide | 15/100, 7 défauts, invalide | 100/100, 0 défaut, acceptée localement | +100 points | 2 |
| `software_engineering` | 75/100, 2 défauts, valide pour l'évaluateur | 90/100, 1 défaut, valide pour l'évaluateur | 100/100, 0 défaut, acceptée localement | +25 points | 2 |

Les conditions A/B rapportent `evaluation.valid` comme `promoted`, tandis que
la condition C utilise le verdict de boucle avec seuil 80. Ces booléens ne
mesurent donc pas exactement la même porte d'acceptation. Le score de 100 du
module logiciel ne démontre pas sa correction fonctionnelle.

## Vérifications de cette revue

| Vérification | Résultat observé |
| --- | --- |
| `node backend/tests/test_quality_elevation_loop.js` | Code 0 ; suite de mécanisme réussie |
| `node benchmarks/gqel-elevation/run_elevation_benchmark.cjs` | Code 0 ; scores et deux itérations conformes au tableau ci-dessus |
| Exemple JavaScript extrait du guide d'intégration | Code 0 ; `promoted`, deux itérations, score 100, gain 25 |
| Contrôle documentaire ciblé | Code 0 ; sept documents, 60 liens locaux existants, blocs de code équilibrés, cinq index de famille et hub général vérifiés |
| Sondes Node.js des limites documentées | Code 0 ; dépassement de deux à quatre itérations en stagnation, critères et double aveugle déclaratifs, indices de tests non exécutés, conservation à score égal et comparaison adjacente reproduits |
| `python scripts/ci/check_code_quality.py` | Code 0 ; 8 418 fichiers source contrôlés, aucune violation |
| `npm test` | Code 0 à la relance normale après libération du verrou ; suites racine, backend, Garage et P1 V3 terminées. La première tentative avait été refusée au prévol car le verrou était détenu par le PID 25488 |
| `cargo test --workspace` | Code 0 ; compilation, tests du workspace et doctests terminés sans échec |
| `git -c core.whitespace=cr-at-eol diff --check` sur les documents concernés | Code 0 ; contrôle tenant compte des fins de ligne Windows |

Ces vérifications portent sur un checkout partagé en évolution. Le contrôle
qualité global et les tests de mécanisme ne constituent pas une qualification
de l'amplification sur des générations LLM réelles.

## Campagne nécessaire pour qualifier l'amplification

Ce protocole reste à exécuter ; il ne décrit pas un résultat acquis.

1. Sceller un corpus réservé, les critères métier, l'effet minimal recherché,
   les budgets, les conditions d'arrêt et le plan d'analyse avant les résultats.
2. Comparer génération unique, révision libre et GQEL sur les mêmes missions,
   avec modèle et paramètres identiques. Tracer les tokens, coûts et temps ;
   traiter explicitement l'écart de ressources entre conditions.
3. Conserver toutes les générations réelles, prompts de réparation, erreurs,
   refus, régressions et arrêts, sans remplacer les réponses défavorables.
4. Évaluer hors de la boucle : tests exécutés sur l'artefact exact pour le code,
   grille et juges indépendants pour l'écriture. Une comparaison aveugle peut
   permuter l'ordre des candidats et mesurer les biais de position.
5. Répéter les essais selon le plan préétabli ; publier distribution des gains,
   taux d'acceptation externe, régressions, stagnations, coûts et incertitude.
6. Vérifier les raccords complets worker/A-Team/Trinity et les refus de promotion
   sans preuve. Qualifier séparément persistance, reprise et budgets si ajoutés.

Un bénéfice sur corpus réservé, un gain de score interne et une autorisation
de promotion sont trois résultats distincts. Le rapport de campagne devra
conserver cette séparation, y compris si le bénéfice mesuré est nul ou négatif.
