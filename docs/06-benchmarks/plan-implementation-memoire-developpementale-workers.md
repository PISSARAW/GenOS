# Plan d'implémentation — mémoire développementale des 19 workers

## Résultat visé

Pour **chaque type canonique**, le même worker vit au moins deux missions comparables dans un périmètre isolé, produit des observations vérifiées, conserve des épisodes après fermeture du processus, consolide une leçon attribuable à son expérience, puis change une décision mesurable lors d'une troisième mission après redémarrage. Un worker témoin sans expérience conserve la politique initiale. Les contrôles de preuve, de tenant, de budget et de promotion restent actifs.

État de départ : 18/19 types ont produit un artefact natif valide, aucun n'a une mémoire développementale vérifiée. La mission parente `sub_orchestrator` échoue parce que son enfant n'a pas de complétion vérifiée. Le rapport et les mesures de référence sont dans ce dossier et dans `D:\GenOS-developmental-memory-campaign-v2`.

## Décisions à fixer avant le code

1. **ADR mémoire individuelle.** Une leçon autobiographique doit porter `agent_id` et ne doit pas être rappelée par un autre worker implicitement. Le partage au niveau organisation/projet sera une opération distincte, avec provenance explicite. Aujourd'hui, `autobiographical_lessons` n'a pas `agent_id` et `lessonService` groupe seulement par type/stratégie/tenant.
2. **ADR fin de mission et apprentissage.** Un artefact natif vérifié, une fin d'exécution, une fin de mission acceptée et une promotion sont quatre états distincts. Une expérience peut être mémorisée comme succès local ou échec de contrôle, avec son statut exact, sans transformer un refus de promotion en succès.
3. **Représentation durable.** Le minimum est une leçon persistée qui modifie de nouveau la politique après redémarrage. Si la politique elle-même devient durable dans `agent_self_models`, définir une mise à jour bornée, idempotente et traçable à ses épisodes ; ne jamais appliquer deux fois le même delta au redémarrage.

## Lots ordonnés

### 0. Reproduction et environnement

- Fixer un environnement Node pris en charge dans le checkout D:, installer les dépendances depuis les lockfiles, puis relancer `npm test`. Le module `@biscuit-auth/biscuit-wasm` est déclaré dans `backend/package-lock.json` mais absent de l'installation utilisée lors du précédent essai.
- Corriger `test_autobiographical_orchestrator_recall.js` après diagnostic de son `0 !== 1`. Privilégier une vraie base SQLite temporaire à un faux accès SQL qui suit mal les requêtes réelles.
- Garder les bases, capsules, journaux et résultats sous `D:` et hors Git ; enregistrer commit, versions d'outils, variables non secrètes et identifiants de campagne dans un manifeste de reproduction.

**Sortie :** les tests de référence donnent un état de départ reproductible, sans confondre dépendance absente et régression du code.

### 1. Capture réellement branchée aux missions

- Extraire le démarrage/arrêt de l'écouteur de `backend/server.js` en une fonction de cycle de vie réutilisable. Le serveur désigné (`GENOS_JOB_WORKER=1`) et le banc end-to-end doivent appeler **le même point d'entrée** ; éviter un chemin de capture spécial réservé aux tests.
- Ajouter un test avec un worker réel : après `EVIDENCE_REPORT` et `AGENT_COMPLETED`, attendre la vidange de la télémétrie, fermer le processus, rouvrir la base et vérifier l'épisode. Vérifier aussi l'absence de doublon si le démarrage est appelé deux fois.
- Tester la fermeture propre : les écritures de capture en cours doivent être attendues, pas perdues par une fermeture immédiate de SQLite.

**Sortie :** un événement éligible émis par le runtime réel peut être retrouvé comme épisode durable après redémarrage.

### 2. Contrat d'événement, preuve et résultat

- Dans `salience.js`, reconnaître `evidenceReport` seulement après validation par le contrat d'artefact ou une référence à un reçu vérifié. Documenter les signaux de succès, d'échec, de coût et de surprise ; régler le seuil à partir de cas positifs et négatifs mesurés. Ne pas abaisser globalement le seuil pour faire passer le banc.
- Dans `captureService.js`, dériver un résultat canonique de `eventType`, du rapport vérifié et du contrôle final : `success`, `failed`, ou `blocked` avec sa cause. Ne pas utiliser directement les valeurs télémétriques `completed` et `error` comme résultat d'apprentissage. Conserver séparément le statut brut pour l'audit.
- Résoudre `agentId`, `missionId`, `organizationId` et `projectId` depuis l'identité persistée de mission et le workspace ; rejeter les paires de tenant incomplètes et les contradictions. Dédupliquer les captures par événement/source durable.
- Ajouter des tests négatifs : preuve auto-déclarée non validée, rapport falsifié, événement répété, tenant étranger, succès suivi d'un refus de promotion. Ce dernier doit conserver deux observations exactes, sans faux succès final.

**Sortie :** les événements natifs admissibles franchissent la capture ; les refus et les preuves invalides restent fidèlement qualifiés.

### 3. Consolidation et identité de l'agent

- Migrer `autobiographical_lessons` avec `agent_id`, un index de consultation et une clé de leçon incluant l'agent. Prévoir la migration des anciennes lignes sans les attribuer arbitrairement ; elles restent auditables ou exigent une validation avant activation.
- Faire consolider seulement des épisodes au résultat canonique et à la provenance vérifiée. Conserver `MIN_SUPPORT_FOR_LESSON=2` comme garde minimale, tester les exemples contraires et le seuil de rappel `0,55`.
- Rendre le cycle de consolidation déclenchable explicitement pour le banc via le même service que le job worker, sans attendre l'intervalle d'une heure. Vérifier qu'une exécution répétée est idempotente et qu'une leçon reste lisible après fermeture/réouverture de SQLite.
- Tester l'isolation : deux expériences d'un worker ne deviennent pas la leçon d'un autre worker du même type, ni d'un autre tenant.

**Sortie :** une leçon durable a des épisodes supports, un propriétaire, un périmètre et un résultat reproductible.

### 4. Complétion vérifiée et sous-orchestration

- Faire passer les missions natives par le chemin existant de vérification indépendante (`nativeOracleGate`, reçus de vérificateur et contrôle des nonces). Fournir de vrais reçus liés à l'artefact, à l'exécution et au tenant dans l'environnement isolé ; ne jamais forger un champ `independentVerification` ni désactiver `require_independent_verification`.
- Corriger le banc et, si nécessaire, le transport enfant de `subOrchestratorDispatchService` pour que la complétion vérifiée de l'enfant soit observable par le parent. Conserver les limites de délégation, de profondeur, de temps et de budget.
- Tester séparément : artefact valide mais promotion refusée, reçu vérifié puis mission acceptée, reçu rejoué, reçu d'un autre agent/tenant, enfant échoué et parent échoué.

**Sortie :** les 19 types ont un parcours de mission accepté lorsque les preuves requises existent ; les refus restent des refus attendus.

### 5. Banc de mesure d'une vraie adaptation

- Remplacer la lecture du seul dernier événement dans `run_worker_compliance_mission.cjs` par une lecture de l'exécution et de ses événements corrélés. Rapporter séparément artefact, preuve indépendante, statut de mission, promotion et échec ultérieur ; ne pas inférer l'absence d'artefact de l'état `idle` après réarmement.
- Faire vivre deux expériences comparables **au même agent**, consolider, fermer le processus, puis exécuter une troisième mission avec cet agent. Enregistrer politique avant/après, leçon rappelée, décision, résultat et référence aux épisodes. Exécuter un témoin sans leçon et une expérience contraire pour écarter un changement dû à une autre cause.
- Supprimer la valeur de sonde codée en dur `kind: 'mission_end'` si elle ne correspond pas au contexte de planification réel. Vérifier le rappel via `agentAutonomyPlanService` lors de la mission, puis confirmer en lecture seule avec une sonde séparée.
- Tester chaque type canonique et le sous-orchestrateur avec son enfant ; émettre un JSON par campagne et un tableau de synthèse. Un verdict « mémoire vérifiée » exige provenance, durabilité, rappel et changement causal de décision, pas seulement un delta de deux nombres.

**Sortie :** 19/19 parcours expérimentaux interprétables ; tout échec indique l'étape exacte (capture, consolidation, rappel, décision, vérification ou promotion).

### 6. Validation et intégration

- Lancer les tests unitaires ciblés, `npm --prefix backend run test:workers`, les tests de sécurité des reçus/tenants, `npm test`, le contrôle de qualité et `cargo test --workspace` dans le checkout D:.
- Ajouter le nouveau banc end-to-end en CI avec une variante rapide déterministe et garder la campagne complète 19 types comme validation périodique ou de release si son coût est trop élevé pour chaque commit.
- Relire les migrations sur une base existante, les preuves de non-régression des portes de promotion et les journaux de campagne. Mettre à jour le rapport de référence avec les résultats réellement obtenus, y compris les échecs.

**Sortie finale :** commit(s) séparés par lot, worktree propre, 19/19 types couverts, preuves brutes conservées sur D:, aucune promotion simulée et aucune fuite entre agents ou tenants.

## Dépendances et ordre de livraison

`0 → 1 → 2 → 3 → 5 → 6`. Le lot 4 peut avancer après le lot 0 en parallèle conceptuel, mais le verdict complet du lot 5 dépend de sa réussite. Les ADR précèdent les migrations et tout changement de sens de « succès ».

## Risques à surveiller

- **Apprentissage à partir de faux succès :** séparer résultat de méthode, validation d'artefact, mission acceptée et promotion.
- **Contamination entre agents :** ajouter une identité d'agent aux leçons et tester les transferts uniquement explicites.
- **Double apprentissage :** capturer et consolider de façon idempotente avec des identifiants d'événement/reçu durables.
- **Tests artificiellement verts :** conserver un témoin, des contre-exemples, des redémarrages et les portes de preuve actives.

## Avancement constaté le 10 octobre 2026

| Lot | État | Preuve ou travail restant |
| --- | --- | --- |
| 0 — environnement | Partiel | Node 22 compatible et dépendances des lockfiles installées sur D:. Un passage global sous Node 24 a expiré dans un sous-processus d'oracle ; un passage sous Node 22 a révélé `SQLITE_BUSY` dans le helper synchrone de contention. Ce helper a été corrigé et le test isolé passe. Le dernier passage global a été interrompu par le renouvellement de l'environnement pendant le profil worker, sans verdict final. |
| 1 — capture | Réalisé | Écouteur de production branché au banc, vidange attendue, épisodes retrouvés après fermeture et réouverture. |
| 2 — événements et preuve | Réalisé pour les méthodes couvertes | Artefact validé, fin non vérifiée, succès accepté et blocage d'oracle distingués ; déduplication et tenant persisté. Ajouter les cas de reçu falsifié et de tenant contradictoire de bout en bout. |
| 3 — leçon individuelle | Réalisé | Migration `agent_id`, supports du même agent, contrôle d'un résultat contradictoire, rappel après redémarrage. |
| 4 — complétion vérifiée | Bloqué pour 18 types | Implémenter une vérification indépendante propre à chaque méthode native restante. Le sous-orchestrateur dépend aussi de la complétion acceptée de ses enfants. |
| 5 — causalité | Partiel | 19 types et trois missions mesurés ; un type montre une politique modifiée en mission et après redémarrage. Mesurer un choix d'action qui change causalement et un témoin pour chaque type. |
| 6 — validation | Partiel | `cargo test --workspace --offline`, profil worker (20 suites) et qualité passent. Le test d'oracle natif corrigé passe isolément sous Node 22. La campagne complète reste rouge 18/19 au contrôle indépendant ; un `npm test` global complet sous Node 22 reste à obtenir. |

Les mesures brutes et le détail du verdict figurent dans `memoire-developpementale-workers-reels.md` et dans les racines de campagne `D:\GenOS-developmental-memory-campaign-v11` et `D:\GenOS-developmental-memory-campaign-v13-recovery`. Les prochaines étapes prioritaires sont les oracles sémantiques indépendants pour les 18 méthodes, leur batterie de refus (rejeu, autre agent/tenant, mutation), puis le branchement d'une décision du runtime sur la politique rappelée avec groupe témoin.

### Point de contrôle du 11 octobre 2026

Les lots 1 à 3 sont commités. La campagne réelle couvre les 19 types, mais le lot 4 reste le verrou fonctionnel : 18 fins de mission sont refusées avec `ORACLE_DOMAIN_UNAVAILABLE`. Les sous-tests isolés de mémoire, de complétion et des six cas de coût d'échec de l'oracle passent sous Node 22 après la correction de deux attentes fragiles et du sous-processus bloquant. La suite globale `npm test` s'est ensuite terminée avec le code de sortie 0 sous Node 22 ; le lot 6 reste partiel à cause du verdict expérimental 0/19.

Pour avancer sur le lot 4, dresser d'abord la matrice `type → méthode native → domaine de preuve → propriété vérifiable indépendamment → reçu attendu`. Implémenter les vérificateurs par domaine avec fixtures positives et mutations négatives, en gardant les mêmes contrôles de nonce, tenant, budget et liaison à l'artefact. Rejouer ensuite les trois missions pour chaque type ; le parent `sub_orchestrator` doit être jugé à partir de la complétion vérifiée de son enfant réel. Pour le lot 5, enregistrer un choix d'action avant/après rappel et le comparer à un worker témoin sans expérience ; le seul delta de `riskTolerance` ne suffit pas au verdict strict.

### Matrice de travail du lot 4

Cette matrice désigne des **propriétés à spécifier**, pas des oracles déjà disponibles. Chaque vérificateur devra reconstruire son sujet depuis le binding de mission et l'observation persistée, puis produire un reçu indépendant lié au run, à l'agent, au tenant, à l'artefact et à la validité temporelle.

| Type | Méthode native | Propriété minimale à vérifier indépendamment |
| --- | --- | --- |
| `scout_cell` | `scan_literal` | Correspondance exacte des termes et des positions dans les sources fournies. |
| `resident_daemon` | `monitor_samples` | Seuil, horodatage et échantillons qui justifient chaque alerte. |
| `bounded_worker` | `scoped_procedure` | Postconditions du `subset_sum` ; domaine déjà couvert. |
| `adaptive_worker` | `adapt_procedure` | Résultat de chaque essai LPT et règle documentée de sélection de stratégie. |
| `specialist` | `niche_procedure` | Résultat LPT et correspondance du périmètre de spécialité. |
| `procedural_executor` | `subset_sum` | Témoin, somme et nombre de sommes atteignables pour la méthode directe. |
| `symbiotic_worker` | `host_procedure` | Résultat `subset_sum` et autorisation de capacité du contrat hôte. |
| `verifier_worker` | `verify_procedure` | Recalcul du résultat et concordance avec le reçu candidat. |
| `red_worker` | `falsify_procedure` | Contre-exemple reproductible contre le reçu candidat. |
| `experimental_worker` | `measure_lpt` | Makespan LPT recalculé et comparaison au seuil déclaré. |
| `formal_worker` | `check_arithmetic` | Interprétation bornée de l'expression et valeur arithmétique recalculée. |
| `synthesis_worker` | `synthesize_claims` | Traçabilité des positions et contradictions des sources fournies. |
| `creative_worker` | `combine_candidates` | Couverture combinatoire et provenance ; aucun jugement esthétique induit. |
| `medical_worker` | `review_synthetic_case` | Périmètre éducatif, provenance et incertitude ; aucune validité clinique induite. |
| `recovery_worker` | `restore_checkpoint` | Digests de l'état initial, du checkpoint et de l'état restauré. |
| `forensic_worker` | `trace_declared_causes` | Cohérence des références et de l'ordre déclaré ; aucune causalité réelle induite. |
| `liaison_worker` | `prepare_handoff` | Correspondance des éléments, groupes et sources du transfert. |
| `teaching_worker` | `teach_subset_sum` | Résultat du problème et vérification des indices de l'apprenant. |
| `sub_orchestrator` | `coordinate_children` | Ensemble attendu des enfants et statut accepté de chacun, lié à la mission parente. |

Les domaines proches peuvent partager du calcul indépendant, mais chaque enveloppe de méthode et chaque reçu doivent être contrôlés séparément. Les tests négatifs doivent modifier un résultat, une source, un agent, un tenant, un nonce et un reçu expiré sans changer le verdict de refus attendu.
