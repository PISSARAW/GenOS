# Qualification fonctionnelle ETT — 2026-10-20

- **Statut** : qualification fonctionnelle ciblée réussie ; qualification scientifique et production non acquises
- **Code évalué** : commit `c025f8c9` (`[FEAT] Complete bounded ETT execution campaign`)
- **Portée** : cycles réels dans les fixtures, reprise SQLite, campagne synthétique et raccord résident fail-closed
- **Date** : 2026-10-20

Ce rapport sépare quatre questions :

1. la boucle exécute-t-elle réellement plusieurs cycles ?
2. reprend-elle après crash sans casser lignée, budget ou comptabilité ?
3. la campagne publie-t-elle aussi ses échecs et ses cas sans gain ?
4. le scheduler de production refuse-t-il une activation incomplète ?

Il ne répond pas à la question scientifique « la pensée endogène apporte-t-elle
un gain sur le corpus réservé ? ». Cette campagne n'a pas été exécutée.

## 1. Protocole de vérification

Commandes exécutées depuis la racine avant le commit évalué :

```powershell
npm --prefix backend run test:ett
python scripts/ci/check_code_quality.py --strict
python scripts/ci/check_adr_index.py
```

Résultats observés :

| Contrôle | Résultat |
| --- | --- |
| suite ETT | exit `0`, treize fichiers de tests réussis |
| qualité stricte | `6941 source files checked, 0 violations (0 new)` |
| index ADR | `770 files, 770 rows, 0 problems` |
| hook pré-commit | 9 fichiers source du commit, 0 violation nouvelle |
| reçu du commit | 15 chemins déclarés et vérifiés |

Des messages SQLite de tables vectorielles absentes ont été écrits pendant le
test d'apprentissage ; le test a utilisé son repli prévu et s'est terminé avec
succès. Ils ne constituent pas une preuve que les extensions vectorielles sont
disponibles.

## 2. Trois cycles effectifs

Le scénario `testMultiCycleExecution` utilise un solver déclaré
`genos-test-solver/v1`. Le sandbox appelle réellement sa méthode `solve()` ; il
ne se contente plus de renvoyer le résultat par défaut.

Assertions exécutées :

| Propriété | Observation |
| --- | --- |
| cycles | `3` |
| invocations solver | `3` |
| runs persistés | `3` |
| vérifications persistées | `3` |
| apprentissages persistés | `3` |
| questions de suivi | `2` |
| état terminal | `STOPPED` |
| motif de borne | limite de trois cycles |
| usage cumulé | `{ tokens: 30, usd: 0.003, seconds: 3 }` |

Chaque reçu de run contient la référence
`solver-model:genos-test-solver/v1`. Chaque invocation observe les frontières
`isolated-read-only`, `readOnly: true`, réseau, mutation et action externe à
`false`.

Les deux questions de suivi sont construites depuis le contexte d'apprentissage
du cycle précédent. Le test exige `verdict: supported`, la présence du résumé
vérifié et l'inclusion de l'hypothèse précédente ; la troisième hypothèse inclut
donc la deuxième au lieu d'être une répétition indépendante du résultat.

### 2.1 Indépendance de la vérification

Chaque vérification porte `boundaries.independentVerifier: true`. L'empreinte de
clé du vérificateur est comparée à l'empreinte de la clé d'autorité et doit être
différente pour les trois cycles. La fixture distingue aussi le producteur.

Cette preuve est fonctionnelle et cryptographique dans le test. Elle ne prouve
pas qu'un futur déploiement utilisera des processus, opérateurs ou fournisseurs
organisationnellement indépendants ; cette séparation reste à provisionner.

## 3. Reprise après crash

Le scénario `testCrashRecoveryRunning` utilise une base SQLite fichier :

1. l'épisode est préparé jusqu'à `RUNNING` ;
2. le reçu de run et la tête sont mémorisés ;
3. la connexion est fermée ;
4. la même base est rouverte ;
5. `runAutonomousLoop()` reprend jusqu'à `STOPPED`.

Résultats :

- le même `runReceiptId` est restitué avec `replayed: true` ;
- le solver reste invoqué une seule fois ;
- l'usage est reconstruit à `{ tokens: 15, usd: 0.001, seconds: 1 }` ;
- chaque `previousReceiptId` pointe vers le reçu précédent ;
- chaque transition conserve le budget
  `{ tokens: 500, usd: 0.05, seconds: 30 }` ;
- une seule vérification est persistée.

Des scénarios complémentaires reprennent aussi depuis `VERIFIED` et contrôlent
le budget cumulatif au travers des redémarrages. La preuve porte sur la fixture
SQLite locale, pas sur une bascule multi-hôtes ou un stockage réseau.

## 4. Campagne et ablations

Le runner déclare dix-huit cas de développement : trois graines multipliées par
six problèmes GenOS synthétiques. Le test de contrat vérifie ce catalogue puis
exécute un cas `learnable_anomaly` dans les sept conditions.

| Condition | Résultat exercé par le test |
| --- | --- |
| `full` | résultat `supported`, appris, suivi effectué, puis `STOPPED` |
| `planned_control` | abstention bornée `ett-planned-abstention-v1` |
| `curiosity_ablated` | refus `below-threshold` |
| `shev_initiative_ablated` | refus `shev-initiative-ablated` |
| `agow_arbitration_ablated` | terminal `ABSTAINED` |
| `metacognition_ablated` | terminal `VERIFIED`, sans apprentissage |
| `memory_ablated` | terminal `LEARNED`, sans continuation |

Toutes ces sorties portent `scientificEvidence: false`. Pour le chemin complet,
`verifiedDiscoveries` et `normalizedCost` restent à zéro dans l'agrégat
scientifique, même si le harnais attribue `developmentUtility: 1`.

### 4.1 Publication des résultats négatifs

`test_endogenous_thought_experiment.js` injecte deux cas et une erreur
`CONTROL_FAILED` sur le contrôle planifié du premier cas. Le service :

- continue les autres conditions et le second cas ;
- compte un échec dans le résumé du contrôle ;
- publie l'échec avec code, étape et message ;
- publie le second cas comme absence de gain (`fullScore = 0`,
  `plannedControlScore = 0`) ;
- marque la base `synthetic_development_indicator` ;
- conserve `scientificClaimAllowed: false`.

Le test refuse aussi une expérience sans drapeau `holdout` booléen et une
réplication mélangeant développement et holdout.

### 4.2 Ce qui n'a pas été exécuté

La commande complète `genos-ett-campaign.cjs` est exécutable, mais le rapport de
qualification ne prétend pas que ses 18 × 7 combinaisons constituent une
campagne scientifique. Le runner fourni emploie un verdict synthétique, une
consommation nulle et les graines de développement. Les graines réservées
`401`, `503`, `607` n'ont pas été ouvertes.

## 5. Raccord résident

`test_endogenous_thought_resident_scheduler.js` vérifie :

| Cas | Preuve |
| --- | --- |
| défaut | `unavailable/disabled` |
| `enabled: true` sans providers | les six dépendances manquantes sont listées |
| injection complète | `runAutonomousLoop()` reçoit base, candidat, borne et identité scheduler |
| usage | la consommation du candidat est ignorée ; la réponse vient des reçus validés |
| scheduler réel | au moins un cycle `idleTick` et résultat ETT explicitement indisponible |

Le test injecté simule le résultat de la boucle pour isoler le raccord. La suite
des cycles teste séparément la vraie boucle et ses reçus. Ensemble, ils prouvent
la disponibilité du chemin d'intégration et son défaut fermé, pas une activation
production.

## 6. Matrice de preuve

| Claim borné | Preuve | Niveau atteint | Limite |
| --- | --- | --- | --- |
| plusieurs cycles réels | test cycles, solver appelé 3 fois | fonctionnel | modèle de test déterministe |
| résultat précédent utilisé | 2 hypothèses de suivi liées | fonctionnel | pertinence non évaluée |
| vérification indépendante | 3 reçus, clés distinctes | contrat/test | séparation organisationnelle future |
| coûts mesurés | compteur injecté, sommes exactes | fonctionnel | pas de provider réel |
| reprise sans double run | fermeture/réouverture SQLite | fonctionnel durable | pas de failover distribué |
| budgets et lignée conservés | assertions sur tous les reçus | fonctionnel durable | fixture locale |
| échecs publiés | erreur injectée conservée | fonctionnel | pas de campagne réelle |
| cas sans gain publiés | paire synthétique conservée | fonctionnel | indicateur non scientifique |
| scheduler sûr par défaut | indisponible sans providers | fonctionnel | providers absents |
| bénéfice scientifique | aucune | non acquis | corpus réservé non exécuté |

## 7. Menaces à la validité

### 7.1 Validité interne

- le solver et les oracles de campagne sont déterministes ;
- les coûts du test sont fournis par un compteur injecté ;
- le test de scheduler remplace la boucle par un stub pour le chemin injecté ;
- les horloges et clés appartiennent aux fixtures.

Ces choix sont adaptés à la vérification de contrats, pas à l'estimation d'un
effet cognitif.

### 7.2 Validité externe

- aucun modèle distant ou local réel n'est qualifié ;
- aucun incident de production n'est rejoué ;
- aucun vérificateur externe administrativement indépendant n'est provisionné ;
- aucune isolation hostile ou fuite réseau n'est testée ici ;
- Windows local et SQLite ne représentent pas tous les déploiements.

### 7.3 Validité statistique

- aucune puissance n'est calculée ;
- aucun intervalle de confiance ni test de significativité n'est produit ;
- les résultats synthétiques n'alimentent pas la métrique primaire ;
- les réplications holdout restent à exécuter.

## 8. Gates avant une affirmation scientifique

Une affirmation de gain exige au minimum :

1. gel du modèle, du provider, des paramètres et de l'environnement ;
2. scellement des problèmes et oracles avant ouverture des graines réservées ;
3. mesure indépendante des jetons, USD et secondes ;
4. vérificateur indépendant du producteur et de l'autorité ;
5. exécution des sept conditions sur les mêmes paires ;
6. conservation de tous les échecs ;
7. trois réplications holdout indépendantes au minimum ;
8. analyse des contrôles négatifs ;
9. publication des cas sans gain et des régressions ;
10. revue humaine avant toute modification du statut de maturité.

Même après ces gates, ETT ne pourrait conclure qu'à une performance sur le
protocole défini. Il ne démontrerait ni conscience, ni autonomie générale.

## 9. Conclusion

Le commit évalué établit une chaîne ETT fonctionnelle, multicycle, reprenable et
fail-closed. Il démontre la séparation des étapes, l'intégrité de lignée et la
capacité à rapporter les résultats négatifs. Il ne démontre pas que la boucle
complète surpasse le contrôle planifié dans un environnement réel.

Le statut opposable reste donc : **runtime fonctionnel qualifié dans les
fixtures ; campagne scientifique et activation production non réalisées**.

## Voir aussi

- [Endogenous Thought Test — concept](../01-concepts/endogenous-thought-test.md)
- [Pensée endogène bornée — orchestration](../02-orchestration/pensee-endogene-bornee.md)
- [Runtime ETT — référence](../03-reference/runtime-pensee-endogene.md)
- [ETT — guide d'exploitation](../04-exploitation/pensee-endogene.md)
- [Protocole du benchmark](../../benchmarks/endogenous-thought/protocol-v1.json)
