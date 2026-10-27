# Vérifications ETT-BENCH

Date de mise à jour : 2026-10-28. Résultats observés dans le workspace, sans inférer la réussite des commandes interrompues ou échouées.

| Commande | Résultat | Détail |
| --- | --- | --- |
| `npm --prefix backend run test:ett` | Réussi | Contrats, reprise multicycle, intégration campagne et frontières de preuve passés. La commande a fini avant que le runner synthétique lancé dans la même session n'échoue initialement faute de dossier de sortie ; elle a ensuite été suivie d'une relance réussie du pilote. |
| `node benchmarks/ett/tests/test_statistics.js` | Réussi | Bootstrap apparié hiérarchique déterministe, correction de Holm et contrat de CLI. |
| `node backend/bin/genos-ett-campaign.cjs --output benchmarks/ett/reports/development-pilot.json` | Réussi | 18 cas × 7 conditions ; reçu de développement synthétique, non scientifique. Voir le JSON voisin. |
| `cargo test --workspace` | Réussi | Relancé le 2026-10-28, code de sortie 0 ; tests et doc-tests du workspace passés. Avertissements Rust préexistants (imports/variables inutilisés et messages linker). |
| `npm test` | Réussi | Relancé le 2026-10-28, code de sortie 0 ; profil workers 39/39 suites, garage 8/8, P1-v3 et profils backend restants passés. Avertissements de fixtures/migrations attendus dans certains tests négatifs. |
| `npm run test:ett:runtime` | Réussi | Contrat des 12 modules scénario, trois niveaux, ordonnanceur de cas et cinq adaptateurs indépendants avec politiques/prompts distincts ; doubles de modèle déterministes pour le test des interfaces. |
| `node benchmarks/ett/tests/test_runtime_campaign.js` | Réussi | Les modules construisent 12 domaines d'observation déterministes et distincts sur les trois niveaux ; assertions de score fini, oracle absent des observations et contrats des cinq adaptateurs. |
| `node benchmarks/ett/tests/test_statistics.js` | Réussi | Couverture des manifests, bootstrap apparié, correction de Holm ; ignore le fichier runtime dans la découverte des dossiers. |
| `node benchmarks/ett/run_reference_campaign.js --seeds 1 --output benchmarks/ett/reports/domain-smoke-seed1001-v3.json` | Réussi | 8 contrôles ×36 cas, zéro erreur d'exécution ; contrôle déterministe, aucune revendication scientifique. |
| `node benchmarks/ett/run_reference_campaign.js --seeds 30 --output benchmarks/ett/reports/domain-reference-30seed.json` | Réussi | 8 contrôles ×1 080 cas = 8 640 tentatives, zéro erreur d'exécution. Déterministe, sans LLM et sans revendication scientifique. |
| `node benchmarks/ett/evaluation/replay.js --input benchmarks/ett/reports/domain-reference-30seed.json --output benchmarks/ett/reports/domain-reference-30seed-replay.json` | Réussi | 30 seeds, 8 systèmes ; 0 divergence sur propositions, verdicts oracle, découvertes et actions. Les latences sont exclues du replay. |
| Pilote LLM enregistré dans `domain-runtime-pilot-qwen7b.json` | Invalide, dépassement de budget | Reprise arrêtée à 419/3 240 cas, 392 609 tokens ; dépassement de 142 609 par erreur d'interprétation du budget en reprise. Le reçu porte `stopped_protocol_budget_audit` et est exclu de la qualification. |
| Reprise et garde du budget global | Tests passés | Le runner déduplique les cas, vérifie les hashes des observations, restaure la mémoire vérifiée Voyager et n'autorise un plafond supérieur que via une option explicite ; les reprises restent comptées dans le plafond global. |
| `npm --prefix backend run test:p1-socle` | Réussi | Autorité, oracles natifs, mémoire/récupération, références scientifiques, ETT et portes de promotion passés. |
| `node backend/tests/test_worker_code_unsafe_proposal_retry.js` | Réussi | Vérifie le wrapper `WORKER_TEST_REPAIR_NO_PROGRESS` et l'arrêt après deux erreurs identiques. |
| `node backend/tests/test_mission_authority_envelope.js` | Réussi | Probe local adapté au contrat JSON `artifactText`. |
| `node backend/tests/test_gcir_scientific_visibility.js` | Réussi | Opérations de fixture incluent désormais le champ `state` requis par le schéma. |
| `python scripts/ci/check_code_quality.py` | Échec global | Relance finale : 177 violations, dont 174 au-dessus de la base du dépôt, réparties hors du code ETT livré ; le contrôle ne rejette plus de fichier ETT. |
| `git diff --check -- benchmarks/ett backend/src/services/endogenousThoughtCampaignExecutor.js package.json` | Réussi | Aucun problème d'espacement dans les fichiers ETT concernés. Le diff global contient encore un espace final préexistant dans `backend/src/services/agentGitService/index.js:141`, laissé intact. |

La porte de qualité complète reste rouge à cause de violations réparties dans le dépôt ; les fichiers ETT vérifiés ne produisent pas de rejet propre. Le pilote décrit dans le reçu adjacent n'est pas une qualification scientifique ETT.

## Harnais de référence exécutable

Commande : `node benchmarks/ett/run_reference_campaign.js --seeds 30 --output <fichier-temporaire>` (2026-10-27).

| Vérification | Résultat | Limite |
| --- | --- | --- |
| Couverture | 12 scénarios × 3 difficultés × 30 seeds × 8 systèmes = 8 640 tentatives | Monde générique d'identification par indices, non 12 environnements spécialisés. |
| Exécutions | 0 erreur d'adaptateur pour chacun des huit systèmes | Politiques déterministes locales, aucune API LLM. |
| Taux de réponse vérifiée (descriptive) | GenOS ETT proxy 100 % ; sans curiosité 23,61 % ; sans mémoire 100 % ; ReAct proxy 100 % ; boucle périodique 23,61 % ; Voyager proxy 36,76 % ; AI Scientist proxy 49,54 % ; DGM proxy 23,52 % | Ces taux mesurent uniquement ce monde jouet ; aucune inférence de supériorité ou fidélité aux systèmes originaux. |
| Oracle | Vérificateur lancé en processus enfant ; aucun secret transmis à `solve` | Isolation de processus locale, pas une frontière résistante à l'opérateur de la machine. |
| Coût | Temps hôte rapporté par exécution | Tokens et coût fournisseur non mesurés. Le reçu dit `externalModelCostsMeasured: false` et `scientificClaimAllowed: false`. |

Le reçu complet de cette exécution a été écrit dans le dossier temporaire local `ett-reference-30seed.json`, pas ajouté au dépôt. Une reproduction peut choisir son propre chemin de sortie inédit.

## Scénarios exécutables et adaptateurs autonomes

| Vérification | Résultat observé | Portée |
| --- | --- | --- |
| `npm run test:ett:runtime` | Réussi | Les 12 modules scénario chargent, les 3 niveaux sont déterministes, les propositions n'exposent pas l'oracle, les 5 adaptateurs indépendants appliquent leur politique et leurs limites d'appels. |
| `node benchmarks/ett/run_reference_campaign.js --seeds 1 --output benchmarks/ett/reports/reference-smoke-seed1001-v2.json` | Réussi | 8 contrôles × 36 cas, zéro erreur d'adaptateur ; reçus vérifiés par le processus oracle enfant. Contrôle jouet, une seed. |
| `npm --prefix backend run test:ett` | Réussi | Suite complète des contrats, cycles, reprises, apprentissage, vérification et campagne ETT. Avertissements non bloquants de tables vectorielles optionnelles absentes. |
| `runtime-independent-adapters-priority-seed1001.json` | Terminé, descriptif | 60/60 cas tentés, 31 301 tokens mesurés. ReAct 12/12, boucle périodique 12/12, Voyager adapté 12/12, DGM adapté 12/12 ; AI Scientist v2 adapté 2/12 à cause de JSON invalide avec son premier format. Une seed, développement seulement. |
| `runtime-ai-scientist-adapter-priority-seed1001-v4.json` | Réussi | Après raccourcissement du format et transmission de l'hypothèse/expérience entre les deux étapes, AI Scientist v2 adapté passe 12/12 cas, 7 réponses soutenues par l'oracle, 8 727 tokens. Une seed ; le reçu interdit une revendication scientifique. |
| Première campagne modèle 12 scénarios | Interrompue | `runtime-all-systems-seed1001.json` conserve 147/324 cas et 83 634 tokens mesurés ; le processus a échoué à l'écriture du reçu. Ce fichier partiel n'est ni une campagne complète ni une preuve de qualification. |

Les mondes précédents étaient un générateur générique de métriques. Le 2026-10-28, ils ont été remplacés par douze générateurs de preuves métier déterministes, chacun avec un schéma d'observation et une fonction de score spécifiques. Le smoke local comprend 36 cas appariés par système, trois niveaux et une seed ; il valide l'exécutabilité et l'oracle, pas les seuils scientifiques. Les taux des politiques de référence ne doivent pas être interprétés comme les performances des concurrents.

Le pilote LLM a dépassé le plafond de campagne parce que la reprise a réinitialisé le budget au lieu de conserver le cumul. Le reçu invalide ce résultat et l'écarte des analyses de qualification. Aucun nouvel appel LLM n'est effectué avant révision explicite du budget. La matrice A0–A5 complète n'est pas disponible : A3/A5 restent indisponibles et A2/A4 restent des proxys.

Ordre de grandeur de planification, non résultat de performance : le reçu pilote mesure environ 937 tokens par tentative. Une matrice complète de 12 conditions × 12 épreuves × 3 niveaux × 30 seeds représente 12 960 tentatives, soit environ 12,1 millions de tokens à consommation comparable. L'estimation est incertaine et nécessite un budget explicite supérieur au plafond actuel de 250 000.

Les exécutables originaux Voyager, AI Scientist v2 et DGM ne sont pas installés : les cinq adaptateurs du pilote sont des implémentations séparées, promptées par le même modèle et ne prétendent pas reproduire ces systèmes. Le reçu initial `reference-smoke-seed1001.json` a exposé le décalage du champ `evidence`; `referenceSystems.js` a été corrigé et le reçu v2 ci-dessus confirme zéro échec d'adaptateur. Le premier format long AI Scientist v2 a produit dix sorties mal formées ; le second passage documente le changement de format et ses résultats séparément.

La matrice A0–A5 est qualifiée dans `configs/ablations.yaml` : A0/A1 disposent d'une condition runtime directe, A2/A4 sont des proxys partiels, A3/A5 ne sont pas implémentées. Les portes de vérification et de reprise ne sont pas désactivées pour fabriquer ces ablations. Le reçu `runtime-priority-pilot-qwen7b.json` est invalidé et marqué supersédé : son adaptateur oracle omettait des références de preuve obligatoires. Le pilote Qwen 0.5B est conservé comme échec de format, pas comme résultat de performance.

Une seed sur 12 scénarios × 3 niveaux × 9 systèmes est seulement descriptive. Le protocole à 30 seeds et à six ablations complètes ne tient pas dans le plafond de 250 000 tokens observé ici ; les seuils ETT-L1 à ETT-L5 restent non qualifiés. Aucun effet causal, classement comparatif ou succès scientifique n'est revendiqué.
