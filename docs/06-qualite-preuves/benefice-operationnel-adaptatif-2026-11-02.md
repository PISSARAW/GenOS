# Bénéfice opérationnel de l'allostasie, de la morphogenèse et de l'ontogenèse

- **Date** : 2026-11-02
- **Statut** : bénéfices causaux non établis ; mécanismes rejoués.
- **Révision de base** : `4455188633c5138d21a2ac3a373ca37d419d6acb`.
- **Arbre testé** : modifié par l'ajout du harnais, empreintes avant/après conservées.
- **Portée** : composants backend et contrats de preuve, sans campagne confirmatoire.

## Verdict

Les preuves examinées ne permettent pas d'affirmer que l'allostasie améliore
la survie opérationnelle, que la morphogenèse augmente la réussite après un
changement imprévu, ou que l'ontogenèse produit un apprentissage durable et
autonome. Cela ne réfute pas ces hypothèses : leur effet reste non mesuré.

Le [protocole expérimental](../../benchmarks/operational-adaptation/protocol.json)
explicite les trois comparaisons à réaliser. Son statut est
`draft-not-preregistered` : corpus, nombre d'unités indépendantes et oracles
ne sont pas encore scellés. Il ne constitue pas une préinscription exécutée.

## Observations et écarts de preuve

| Hypothèse | Observation disponible | Preuve manquante |
| --- | --- | --- |
| Allostasie | `test_allostatic_mission_planning.js` compare la même liste avec/sans corrections : 2 workers admis contre 5 sous pression. | Missions exécutées, progression utile, incidents et coûts mesurés ; comparaison avec une limite statique conservatrice. Réduire le dispatch ne mesure pas la survie. |
| Morphogenèse | Tests de recompilation après dérive, quiescence et admission contrefactuelle réussis. | Changement externe imprévu, transition appliquée et avantage sur topologie figée à budget égal. Le plan de changement de régime révèle la contrainte dans le prompt, partage les familles train/test et n'a qu'une répétition. |
| Ontogenèse | Tests de boucle, reprise après crash et continuité persistée réussis ; ancienne mission réelle intégrée à la tentative 8. | Comparaison longitudinale contre boucle autonome sans apprentissage, rétention après redémarrage, transfert réservé et comptage des interventions. Persister un état ne prouve pas une amélioration. |

Le [garde du changement de régime](../../benchmarks/topology-morphogenesis/regime-change-qualification.cjs)
refuse déjà le label confirmatoire au plan actuel. La
[campagne d'autonomie Ontogenèse](campagne-autonomie-ontogenese-2026-10-24.md)
et la [qualification d'une mission réelle](qualification-ontogenese-reelle-2026-10-23.md)
décrivent leurs limites. Aucun résultat historique n'est transféré comme gain
mesuré sur cette révision.

## Rejeu reproductible

```powershell
node benchmarks/operational-adaptation/test-run-mechanisms.cjs
node benchmarks/operational-adaptation/run-mechanisms.cjs
```

Le harnais exécute neuf suites séquentiellement dans des processus Node avec
environnement de test, bases dédiées et clés de test. Il conserve commandes,
dates, durées, codes de sortie, erreurs, sorties brutes et SHA-256 sous
`.genos-agent-worlds/operational-adaptation/<uuid>/`. Le reçu lie révision,
état propre/sale, empreintes des sources avant/après et protocole. Ces artefacts
locaux sont ignorés par Git ; ils ne sont pas une attestation indépendante.

Un timeout, code non nul ou changement de sources fait échouer le contrôle.
Même avec toutes les suites vertes, `causalBenefit` reste `unassessed`,
`experimentalCampaignExecuted` et `authorizesPromotion` restent `false`.
Le code zéro concerne uniquement les mécanismes. Les contre-tests vérifient
les échecs de processus, timeouts et l'absence de qualification causale implicite.

Le premier relevé a obtenu **8/9 suites réussies**. L'échec de
`backend/tests/test_survival_model.js:23` est `0 !== 1` : le test attend un
worker dispatché, le plan n'en admet aucun. Le planificateur applique une
admission atomique aux équipes de sécurité ; cet écart de contrat reste à
résoudre avant qualification. Aucune assertion ni garde n'a été assouplie.
Le diagnostic séparé confirme `atomic: true`, le motif
`worker_budget_below_role_minimum` et un minimum total calculé de 7 600 tokens
pour les 2 400 fournis par le test. Il est conservé dans
`validation-20261102-01/survival-admission.json` sous le dossier de preuves.

Le second relevé, avec environnement de test dédié, retrouve les mêmes huit
succès et le même échec. Il est en outre **non qualifiable pour un arbre figé** :
`stableSources: false` détecte des modifications concurrentes du checkout.
Les reçus locaux sont respectivement
`5378a3cb-1b0f-486b-89ed-c1ae4a50d1e4/report.json` et
`adcf2c00-0ac7-44af-bb2a-95bcce1e182d/report.json` sous le dossier de preuves.
Le premier précède l'ajout de l'environnement dédié au harnais ; ses mécanismes
ont été exécutés avec l'environnement hérité de la session.

Le contrôle qualité global a terminé avec zéro violation. `npm test` a été
refusé avant les suites par le verrou d'une autre validation active (PID 21508) ;
ce refus est conservé sous `validation-20261102-01/npm-test.log`. Le verrou
n'a pas été supprimé. Ces constats ne qualifient pas un checkout en évolution.
`cargo test --workspace` a terminé avec le code zéro ; son journal est conservé
dans `validation-20261102-01/cargo-test.log`. Cela valide les tests Rust exécutés,
sans mesurer les trois bénéfices causaux ni figer les éditions concurrentes.
Une nouvelle exécution du contrôle qualité, après d'autres éditions concurrentes,
échoue sur `benchmarks/competence-100/agent.cjs:49` (complexité 12 > 10), fichier
hors de ce changement. Le journal final est
`validation-20261102-01/code-quality.log` ; le premier passage vert ne doit pas
être présenté comme une validation du checkout final. Les deux contre-tests du
harnais passent après sa dernière modification.

## Expériences nécessaires

### Diagnostic du test de survie et correction

L'historique explique l'incohérence : l'attente d'un worker pour 2 400 tokens
vient du commit `d7077a86d` du 16 septembre. La politique de réserve courante
provient de `5f7152c26b` du 21 octobre. Le test n'avait pas suivi ce contrat.
Pour deux workers, la réserve minimale est `min(total, 4000 + 1000 × 2)`.
À 2 400 tokens elle absorbe tout le budget ; au-delà, il faut au moins
6 000 tokens de réserve et `2 × 800` pour les workers, soit 7 600 au total.
L'admission de sécurité est atomique : financer un seul worker ne suffit pas.

Le test vérifie maintenant le refus à 2 400 tokens, le refus atomique avec
800 tokens disponibles à 6 800, le refus à 7 599 et l'admission de deux workers
à 7 600. L'énergie reste fixée à 0,2 pendant cette variation du budget pour
conserver les mêmes pressions de survie. Aucun code de production, budget
minimal ou garde d'admission n'a été modifié. Les anciens relevés en échec
restent conservés ; la correction ne les transforme pas en campagnes réussies.

Le rejeu après correction obtient **9/9 scripts réussis** dans le reçu
`5011f7d7-cd2d-4023-9f99-56ddb5629b14/report.json`. Son statut global reste
en échec, car `stableSources: false` constate encore des éditions et commits
concurrents. Les deux contre-tests du harnais réussissent et le contrôle qualité
rejoué passe sur 8 182 fichiers avec zéro violation. Une nouvelle tentative de
`npm test` reste refusée par le même verrou actif ; son journal est dans
`validation-commit-20261102/npm-test.log`. Les trois bénéfices causaux restent
`unassessed`, même après correction du contrat de test.

### Comparaisons causales à exécuter

Chaque paire conserve runtime, modèle identifié par digest, outils, budgets
totaux et état initial. Seul le mécanisme testé varie ; les portes dures de
sécurité et de budget restent actives. Randomiser l'ordre et isoler les stores.
Employer des oracles externes à la politique ; conserver échecs, refus et
reprises dans l'analyse de toutes les tentatives assignées.

1. **Allostasie** : corrections mesurées contre ablation et limite statique
   choisie sur entraînement. Injecter pénurie de tokens, perte de workers,
   indisponibilité du modèle et pression mémoire dans un runner isolé. Mesurer
   la fraction de missions utilement terminées et vérifiées avant la limite,
   sans violation ; rapporter débit, réserve, coûts et récupération. Ni sommeil
   indéfini ni abandon de travail requis ne comptent comme survie utile.
   Inclure une charge nominale pour mesurer le prix de la prudence.
2. **Morphogenèse** : changement injecté par un contrôleur externe après une
   frontière enregistrée, caché avant celle-ci. Comparer politique adaptative
   et meilleure topologie figée choisie sur entraînement. Mesurer la réussite
   selon le nouvel oracle et imputer le coût de transition au traitement.
   Exiger une transition appliquée et liée aux workers. Inclure transition
   inadéquate et condition sans changement pour détecter l'adaptation inutile.
3. **Ontogenèse** : plusieurs lignées autonomes apprenantes contre lignées à
   mémoire/politique figées et remise à zéro entre épisodes. Observer **au moins
   sept jours réels ET 100 missions par lignée**. Évaluer des fenêtres tardives
   réservées après redémarrage et retrait du feedback d'apprentissage. Compter
   chaque indice, patch, redémarrage manuel et minute humaine après installation.
   Exiger rétention, transfert et absence d'oubli excessif des anciennes tâches.
   Des ticks accélérés de fixture ne satisfont pas la durée.

La taille des corpus et des groupes reste à déterminer par analyse de puissance
sur un pilote disjoint. Avant les résultats confirmatoires, sceller corpus,
graines, oracles, fenêtres et seuils. Rééchantillonner par mission indépendante
ou lignée ; les épisodes corrélés ne sont pas des réplications indépendantes.
Les trois hypothèses primaires utilisent des intervalles simultanés à
98,333333 % par correction de Bonferroni. Chaque comparaison et fenêtre requise
dans une hypothèse doit satisfaire le critère. Le seuil proposé exige une
borne inférieure supérieure à **10 points de pourcentage** de gain absolu,
avec validité et garde-fous satisfaits. Ce seuil est à figer avant exécution.

## Traçabilité GenOS et limites

Recherche de mémoires d'échec et snapshot MCP réussis :
`snap-d8ddc883e0fc441fa27f8f0145669c1f`. La revue en lecture seule via
`genos_orchestrate`, exécuteur Codex, un worker demandé et budget borné,
a été refusée : `The mission budget cannot fund every 'biome' worker`.
Elle ne constitue ni une revue indépendante achevée ni une expérience réussie.
Les budgets n'ont pas été augmentés pour masquer le refus.

Le prochain résultat probant doit venir de campagnes exécutées avec oracles et
contrôles ; l'ajout de ce protocole ne démontre aucun bénéfice opérationnel.
