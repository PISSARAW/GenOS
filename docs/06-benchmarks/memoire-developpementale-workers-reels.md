# Mémoire développementale avec 19 types de workers réels

## Question et critère

Une mémoire développementale exige ici qu'une mission vécue par un worker crée un épisode durable, qu'un redémarrage permette de rappeler une leçon, puis que cette leçon modifie une représentation utilisée pour planifier une nouvelle mission. Un artefact de mission seul ne satisfait pas ce critère.

## Protocole du 10 octobre 2026

Le banc `backend/tests/run_worker_compliance_missions.cjs`, activé avec `GENOS_COMPLIANCE_NATIVE_ALL=1`, a créé des workers persistés avec leurs contrats, leur identité de mission et leur runtime local. Chaque type a reçu une méthode native adaptée et un scénario synthétique isolé sur `D:`. Les mesures ont été faites dans un **nouveau processus Node** qui rouvre la base SQLite, vérifie l'artefact typé, compte les épisodes autobiographiques du worker et appelle `recallBeforePlanning` sur un plan neuf dont `riskTolerance` et `evidenceStrictness` valent initialement `0.5`. Les missions utilisent des fixtures déterministes ; elles n'établissent pas la capacité d'un modèle distant à apprendre en production.

Le premier passage couvrait les 19 types. Des reprises ciblées ont corrigé la configuration du banc pour `bounded_worker`, `adaptive_worker`, `specialist`, `recovery_worker`, `symbiotic_worker` et `sub_orchestrator`. Les résultats ci-dessous retiennent la dernière exécution de chaque type. L'enfant réel du sous-orchestrateur est compté séparément de son parent. La base, les journaux et les mesures JSON sont dans `D:\GenOS-developmental-memory-campaign` et `D:\GenOS-developmental-memory-campaign-v2` ; ils ne sont pas versionnés.

| Type | Artefact natif valide et événement de fin | Épisodes après redémarrage | Leçons rappelées | Politique modifiée |
| --- | --- | ---: | ---: | --- |
| `scout_cell` | oui | 0 | 0 | non |
| `resident_daemon` | oui | 0 | 0 | non |
| `bounded_worker` | oui | 0 | 0 | non |
| `adaptive_worker` | oui | 0 | 0 | non |
| `specialist` | oui | 0 | 0 | non |
| `procedural_executor` | oui | 0 | 0 | non |
| `symbiotic_worker` | oui | 0 | 0 | non |
| `verifier_worker` | oui | 0 | 0 | non |
| `red_worker` | oui | 0 | 0 | non |
| `experimental_worker` | oui | 0 | 0 | non |
| `formal_worker` | oui | 0 | 0 | non |
| `synthesis_worker` | oui | 0 | 0 | non |
| `creative_worker` | oui | 0 | 0 | non |
| `medical_worker` | oui | 0 | 0 | non |
| `recovery_worker` | oui | 0 | 0 | non |
| `forensic_worker` | oui | 0 | 0 | non |
| `liaison_worker` | oui | 0 | 0 | non |
| `teaching_worker` | oui | 0 | 0 | non |
| `sub_orchestrator` | non | 0 | 0 | non |

**Bilan : 18/19 artefacts natifs valides, 0/19 mémoires développementales vérifiées.** Le `sub_orchestrator` a lancé un enfant `bounded_worker` réel qui a produit un dossier valide et un événement `AGENT_COMPLETED`. Le contrôle de promotion a exigé une vérification indépendante, a refusé la promotion de l'enfant et le parent a échoué avec `WORKER_CHILD_FAILED`. Les 18 autres workers ont aussi émis `AGENT_COMPLETED`, puis échoué à ce même contrôle ; leur artefact valide ne signifie donc pas que leur mission a été promue. Le banc de conformité initial ne reconnaît pas cette séquence et affiche des échecs : le présent bilan vient des événements persistés et de la validation indépendante des artefacts.

## Diagnostic appuyé par les observations

Le serveur branche bien `attachAutobiographicalCapture` dans son processus désigné (`GENOS_JOB_WORKER=1`). **Ce banc lance directement le runtime**, sans démarrer ce processus : aucun écouteur autobiographique n'est donc installé pendant ses missions. Il saute aussi la boucle de consolidation du `jobWorkerOrchestrator`, qui tourne normalement au moins toutes les 60 secondes. Le constat de 0 épisode ne permet pas de conclure que la capture échoue dans un serveur normalement démarré.

Plusieurs obstacles resteraient à lever pour un essai de bout en bout :

- Les événements natifs transportent `payload.evidenceReport`, alors que `salience.js` ne reconnaît comme preuve que `payload.evidence` ou `payload.evidencePresent`. Avec leurs autres champs actuels, `AGENT_COMPLETED` obtient une saillance de 0 et `AGENT_FAILED` 0,25, sous le seuil de capture 0,30. Une simple reconnaissance de la preuve ne donne que 0,20 en l'absence d'autres signaux.
- `captureService.js` reprend le statut télémétrique (`completed` ou `error`) comme résultat de l'épisode. `lessonService.js` ne classe comme succès que `success` et comme échec que `failed` ou `failure`. Une capture éventuelle de ces événements ne constituerait donc pas encore un support exploitable pour une leçon.
- Une leçon demande au moins deux épisodes du même groupe. Le protocole mesure une mission par identité de worker et ne laisse pas tourner un cycle de consolidation avant le redémarrage. Le rappel filtre ensuite les leçons sous 0,55 de confiance.
- La mission du `sub_orchestrator` reste incomplète : son enfant a une preuve native, mais la porte de promotion exige une vérification indépendante. Les autres types ont le même refus après leur événement `AGENT_COMPLETED`. Fournir une véritable vérification indépendante est nécessaire pour mesurer l'apprentissage après une fin de mission acceptée ; il ne faut pas désactiver cette porte pour rendre le test vert.
- Le rapport de conformité lit le dernier événement terminal et l'état `idle` après réarmement. Il masque ainsi les artefacts valides antérieurs. Le présent rapport les a relus directement dans la télémétrie persistée, mais le banc de conformité doit être corrigé pour donner lui-même un verdict exact.

Enfin, la sonde après redémarrage appelle directement `recallBeforePlanning` sur un plan neuf. Elle ne lance pas une seconde mission et ne démontre donc pas encore un changement de décision ou de comportement réel. Les données de mission sont synthétiques et les méthodes locales sont déterministes. Un test complet doit faire vivre plusieurs expériences comparables au même agent, vérifier leur consolidation, redémarrer le processus puis observer une nouvelle décision et son résultat.

Autres limites de validation constatées : `test_autobiographical_orchestrator_recall.js` échoue (`0 !== 1`) avec son faux accès à la base ; la suite globale `npm test` s'arrête sur la dépendance locale absente `@biscuit-auth/biscuit-wasm`. Ces échecs ne changent pas le résultat des missions, mais empêchent d'obtenir un feu vert global. La sonde ne vérifie que deux champs de politique et ne couvre pas toutes les représentations internes. Pour les workers dotés d'un tenant, il faudra aussi vérifier que les événements capturés portent bien le même périmètre organisation/projet que le rappel ; les émissions natives observées ne le précisent pas explicitement.

## Reproduction et limites

1. Créer une racine d'isolation sur `D:` hors du dépôt, puis renseigner `GENOS_COMPLIANCE_ROOT`, `GENOS_DB_PATH`, `GENOS_WORKSPACE_ROOT`, `GENOS_CAPSULE_ROOT`, `GENOS_ADMIN_PASSWORD` et `GENOS_LOCAL_MODEL`. Activer `GENOS_COMPLIANCE_NATIVE_ALL=1` et lancer `node backend/tests/run_worker_compliance_missions.cjs` ; `GENOS_COMPLIANCE_KIND` limite les reprises ciblées.
2. Dans un nouveau processus, lancer `node backend/tests/measure_worker_developmental_memory.cjs <db> <run-id>` et conserver le JSON.
3. Fusionner les passages avec `node backend/tests/summarize_worker_developmental_memory.cjs <measurement.json>...`. L'option `--assert-developmental` retourne un code non nul tant que les 19 types ne satisfont pas le critère complet.

La vérification porte sur les représentations de politique lues par `recallBeforePlanning` : elle ne prétend pas mesurer tous les changements internes possibles. Le test synthétique antérieur par injection manuelle d'épisodes était positif, mais ne démontre pas la capture ni l'apprentissage à partir de missions réelles.

## Mise à jour d'implémentation — campagne du 10 octobre 2026

Les résultats de référence ci-dessus décrivent le **point de départ**. Le banc actuel branche le même écouteur de capture que le serveur, attend sa vidange avant la fermeture SQLite, fait vivre trois missions distinctes au même agent, appelle la consolidation du job worker après la deuxième mission, puis mesure dans un autre processus. Les leçons portent désormais l'identité de l'agent et le tenant. Une complétion n'est comptée comme succès d'apprentissage que si l'exécution persistée est `completed` pour cet agent, avec un artefact validé. Les refus `ORACLE_DOMAIN_UNAVAILABLE` et `ORACLE_BUDGET_EXPIRED` restent des épisodes `blocked`, exclus des leçons de stratégie. Les anciennes leçons sans propriétaire restent consultables pour audit, sans rappel individuel implicite.

La campagne homogène `developmental-v11-all19` a exécuté les 19 types canoniques avec trois missions demandées par parent. Les données sont dans `D:\GenOS-developmental-memory-campaign-v11` (`campaign.log`, `genos.db`, `measurement.json`, `summary.json`). Le retest ciblé `developmental-v13-recovery` est dans `D:\GenOS-developmental-memory-campaign-v13-recovery` ; sa mesure remplace seulement celle de `recovery_worker` dans la synthèse finale. Toutes les fixtures et bases sont sur `D:`.

| Mesure | Résultat observé |
| --- | ---: |
| Types avec artefact natif typé valide | 19/19 |
| Types avec exécution acceptée après vérification indépendante | 1/19 (`bounded_worker`) |
| Types avec épisodes et leçon rappelée en troisième mission, puis après redémarrage | 1/19 (`bounded_worker`) |
| Types avec changement de représentation de politique observé dans la mission | 1/19 (`bounded_worker`) |
| Types avec changement causal de choix d'action démontré | 0/19 |

Pour `bounded_worker`, les trois exécutions sont acceptées et six épisodes sont retrouvés après redémarrage. La consolidation produit une leçon attribuée à cet agent avec trois épisodes supports. Dans sa troisième mission réelle, l'événement `AUTOBIOGRAPHICAL_RECALL_COMPLETED` rapporte une leçon et `riskTolerance` passe de `0,275` à `0,325` environ (`riskDelta=+0,05`). Dans un nouveau processus, la même leçon est rappelée et modifie de nouveau un plan neuf. Le contrôle sans expérience dans les tests unitaires ne reçoit aucune leçon. Ce résultat établit une représentation modifiée et durable pour **un** type, mais la politique ajustée n'est pas encore reliée à un choix d'action différent dans le runtime déterministe.

Les 18 autres types ont un artefact valide, puis une fin de mission refusée par la vérification indépendante avec `ORACLE_DOMAIN_UNAVAILABLE`. L'oracle natif ne possède actuellement que les domaines `subset_sum`, `code_postconditions` et `memory_fidelity`, tandis que leurs méthodes natives relèvent d'autres domaines. Le sous-orchestrateur lance trois enfants réels ; leurs identités sont comptées séparément du parent. Le `recovery_worker` nécessitait aussi la remise de sa fixture `state.txt` à l'état `damaged` dans sa capsule avant chaque répétition : le retest confirme trois exécutions et six épisodes, sans leçon issue du refus d'oracle.

Le verdict strict du banc reste donc **0/19 mémoires développementales entièrement vérifiées** si l'on exige un changement causal de décision et une mission acceptée. La synthèse distingue ce verdict de la mesure intermédiaire `durableRecall=1/19`. Les deux tests de mémoire sont désormais dans le profil rapide `workers` exécuté par la CI ; la campagne complète reste le contrôle périodique de bout en bout. La porte de promotion, les nonces et les reçus indépendants n'ont pas été neutralisés.

Validation du code : `cargo test --workspace --offline`, la porte `check_code_quality.py` (0 violation nouvelle), les 20 suites `workers` sous Node 22 et le test isolé `test_native_oracle_completion.js` passent. La suite `npm test` complète n'a pas encore rendu un code de sortie vert : un lancement sous Node 24 a expiré dans un sous-processus, un lancement sous Node 22 a rencontré `SQLITE_BUSY` dans un helper utilisant `spawnSync`, et le lancement suivant a été interrompu par le renouvellement de l'environnement pendant le profil worker. Le helper utilise désormais un vrai processus enfant asynchrone et son test isolé passe ; la chaîne globale doit encore être relancée jusqu'à son terme.

## Vérifications complémentaires du 11 octobre 2026

Les tests isolés `test_autobiographical_memory.js`, `test_autobiographical_orchestrator_recall.js`, `test_native_oracle_completion.js`, `test_native_memory_budget.js` et `test_native_oracle_failure_costs.js` passent sous Node 22. Ce dernier exécute ses six cas en vrais sous-processus asynchrones : il ne bloque plus la boucle d'événements du parent pendant les écritures SQLite. Le test de retrait de source constate d'abord le retrait persisté, puis accepte les deux refus sûrs possibles si l'autorité d'exécution expire pendant un passage lent. Ces ajustements concernent les tests ; ils ne transforment aucun refus d'oracle en succès.

La campagne 19 types reste rouge au critère strict : `summary-final.json` rapporte `workerTypes=19`, `artifactsValidated=19`, `nativeArtifacts=1`, `durableRecall=1` et `developmental=0`. Les trois enfants du sous-orchestrateur sont listés à part. La prochaine étape fonctionnelle est de fournir des oracles sémantiques indépendants pour les 18 méthodes non couvertes, puis de vérifier une décision effectivement changée par la politique rappelée avec un worker témoin. Le passage complet de `npm test` sous Node 22 s'est ensuite terminé avec le code de sortie 0 ; son journal est `D:\GenOS-developmental-memory-campaign-v11\npm-test-final.log`. La suite logicielle verte ne change pas le verdict expérimental strict.
