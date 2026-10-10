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
