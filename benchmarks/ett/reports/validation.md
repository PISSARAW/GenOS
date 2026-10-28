# Vérifications ETT-BENCH

Date de mise à jour : 2026-10-28. Résultats observés dans le workspace, sans inférer la réussite des commandes interrompues ou échouées.

## Qualification du protocole runtime v3

| Vérification | Résultat observé | Portée |
| --- | --- | --- |
| `node benchmarks/ett/tests/test_runtime_campaign.js` | Réussi après correction | 12 scénarios × 3 niveaux, monde déterministe, étapes spécifiques, budget, traces, refus d'actions hors protocole, réponses sémantiquement fausses et 5 adaptateurs indépendants via doubles de modèle. |
| `npm --prefix backend run test:ett` | Réussi | Contrats ETT backend, admission, cycles, reprise, mémoire, vérification et campagne; messages de tables vectorielles optionnelles absentes non bloquants. |
| `node benchmarks/ett/tests/test_statistics.js` | Réussi | Bootstrap apparié, correction de Holm et contrats CLI. |
| `node benchmarks/ett/run_reference_campaign.js --seeds 1 --output <temporaire>` | Réussi | 8 contrôles × 36 cas, zéro erreur d'exécution; contrôle déterministe de compatibilité, aucune mesure de capacité LLM. |
| `python scripts/ci/check_code_quality.py` | Échec global | 185 violations recensées (182 au-dessus de la baseline); aucune violation `benchmarks/ett` dans le relevé filtré après refactorisation. La porte globale est déjà rouge sur le monorepo et n'est pas attribuée au seul ETT. |
| `npm test` | Réussi le 2026-10-28 | La relance complète a terminé avec code 0; voir le détail dans le relevé ci-dessous. |
| `cargo test --workspace` | Réussi le 2026-10-28 | La relance sur cible D: a terminé avec code 0; voir le détail dans le relevé ci-dessous. |

Les tests d'action synthétiques confirment la cohérence interne du protocole, pas sa validité empirique. Les environnements fournissent des preuves déterministes fabriquées pour l'évaluation; l'oracle mesure les décisions correspondantes et ne remplace pas les critères proposés du protocole original. Une campagne modèle runtime v3 (reçu v4) a été configurée pour les 12 scénarios, 3 niveaux, 30 seeds et 13 conditions. Le plafond de 250 000 tokens l'a arrêtée à 156/14 040 enregistrements après 239 766 tokens mesurés : les enregistrements couvrent uniquement ETT-01 à ETT-04, les trois niveaux et la seed 1001, sous chaque condition. Le reçu `runtime-v4-full-30seed-launch-02.json` et son journal `.usage.jsonl` conservent cet état partiel; `scientificClaimAllowed` est faux et les niveaux ETT-L1 à ETT-L5 restent non qualifiés. Les 13 conditions enregistrées nécessitent au minimum 124 800 appels d'action pour 30 seeds, hors génération endogène, reprises et erreurs. Les adaptateurs Voyager, AI Scientist v2 et DGM demeurent des politiques locales adaptées; leurs systèmes originaux ne sont pas installés. Le compte rendu détaillé est dans [`runtime-model-campaign-2026-10-28.md`](runtime-model-campaign-2026-10-28.md).

## Lancement de la campagne runtime modèle

| Vérification | Résultat observé | Portée |
| --- | --- | --- |
| `npm run benchmark:ett:runtime -- --model ollama://qwen2.5-coder:7b ...` | Partiel, arrêt contrôlé au budget | 156/14 040 enregistrements, 528 appels fournisseur mesurés, 239 766/250 000 tokens. Aucun appel n'a dépassé le plafond; `scientificClaimAllowed: false`. Le reçu v4 et le journal durable d'usage sont conservés à côté de ce rapport. |
| Réparation Ollama | Runtime restauré sur D: | L'installation C: était incomplète (`llama-server.exe` manquant). Le programme d'installation officiel, signature éditeur valide, a échoué faute d'espace sur C:; il a ensuite réussi sur D:. Le serveur et les compteurs Ollama ont été validés avant la reprise. |
| Reprise après `EPERM` de renommage du reçu | Réussi | Le journal réconcilie 291 appels/129 909 tokens. Le reçu a été repris sans perte ni double comptage du plafond; les actions après le dernier enregistrement checkpointé ont pu être rejouées et restent débitées. Le runner réessaie les renommages Windows temporaires (`EPERM`, `EBUSY`, `EACCES`). |
| `node benchmarks/ett/tests/test_campaign_budget_guard.js` | Réussi | Garde par appel, journalisation durable, budget et reprise fail-closed. |
| `node benchmarks/ett/tests/test_runtime_campaign.js` | Réussi | Contrats runtime, scénarios et adaptateurs, incluant la reprise après renommage temporairement bloqué. |
| `python scripts/ci/check_code_quality.py --staged` avant les commits | Réussi pour les changements ETT | 10 puis 3 fichiers source contrôlés; 0 nouvelle violation. |

Le reçu est un lancement empirique partiel, pas une qualification. Aucune comparaison, conclusion causale ou réussite scientifique ne peut être tirée de ces 156 enregistrements. Le plafond protège l'exécution mais ne couvre pas la matrice demandée; augmenter ce plafond demande un budget de campagne distinct.

| Commande | Résultat | Détail |
| --- | --- | --- |
| `npm --prefix backend run test:ett` | Réussi | Contrats, reprise multicycle, intégration campagne et frontières de preuve passés. La commande a fini avant que le runner synthétique lancé dans la même session n'échoue initialement faute de dossier de sortie ; elle a ensuite été suivie d'une relance réussie du pilote. |
| `node benchmarks/ett/tests/test_statistics.js` | Réussi | Bootstrap apparié hiérarchique déterministe, correction de Holm et contrat de CLI. |
| `node backend/bin/genos-ett-campaign.cjs --output benchmarks/ett/reports/development-pilot.json` | Réussi | 18 cas × 7 conditions ; reçu de développement synthétique, non scientifique. Voir le JSON voisin. |
| `cargo test --workspace` | Réussi | Relancé le 2026-10-28, code de sortie 0 ; tests et doc-tests du workspace passés. Avertissements Rust préexistants (imports/variables inutilisés et messages linker). |
| `npm test` | Réussi | Relancé le 2026-10-28, code de sortie 0 ; profil workers 39/39 suites, garage 8/8, P1-v3 et profils backend restants passés. Avertissements de fixtures/migrations attendus dans certains tests négatifs. |
| `npm run test:ett:runtime` | Réussi | Contrat des 12 modules scénario, trois niveaux et cinq adaptateurs indépendants; la suite vérifie aussi l'action inspecter/soumettre avec doubles de modèle déterministes. |
| `node benchmarks/ett/tests/test_runtime_campaign.js` | Réussi | Les 12 mondes cachent les preuves jusqu'à inspection, imposent leur budget d'actions, gardent l'oracle secret et vérifient les cinq politiques d'adaptateurs. |
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
| `python scripts/ci/check_code_quality.py --staged` | Réussi | 21 fichiers ETT livrés, aucune violation nouvelle. Le contrôle global du dépôt reste rouge sur des violations préexistantes hors ETT. |
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
| `npm run test:ett:runtime` | Réussi | Les 12 modules exposent `createWorld/act/result`; les 5 adaptateurs indépendants exécutent inspecter/soumettre sous budget avec des politiques distinctes et sans accès à l'oracle. |
| CLI `ett_01_curiosity/scenario.js` | Réussi | Observation initiale sans preuve, inspection bornée, soumission et trace reproductible; le vérificateur exige l'inspection du candidat répondu. |
| `node benchmarks/ett/run_reference_campaign.js --seeds 1 --output <fichier-temporaire>` | Réussi | 8 contrôles ×36 cas, zéro erreur d'adaptateur; vérifie la compatibilité oracle du contrôle de référence v1. |
| `npm --prefix backend run test:ett` | Réussi | Suite complète des contrats, cycles, reprises, apprentissage, vérification et campagne ETT. Avertissements non bloquants de tables vectorielles optionnelles absentes. |
| `runtime-independent-adapters-priority-seed1001.json` | Terminé, descriptif | 60/60 cas tentés, 31 301 tokens mesurés. ReAct 12/12, boucle périodique 12/12, Voyager adapté 12/12, DGM adapté 12/12 ; AI Scientist v2 adapté 2/12 à cause de JSON invalide avec son premier format. Une seed, développement seulement. |
| `runtime-ai-scientist-adapter-priority-seed1001-v4.json` | Réussi | Après raccourcissement du format et transmission de l'hypothèse/expérience entre les deux étapes, AI Scientist v2 adapté passe 12/12 cas, 7 réponses soutenues par l'oracle, 8 727 tokens. Une seed ; le reçu interdit une revendication scientifique. |
| Première campagne modèle 12 scénarios | Interrompue | `runtime-all-systems-seed1001.json` conserve 147/324 cas et 83 634 tokens mesurés ; le processus a échoué à l'écriture du reçu. Ce fichier partiel n'est ni une campagne complète ni une preuve de qualification. |

Le runtime v2 apporte un contrat d'action exécutable aux douze scénarios métier déterministes. Les agents voient d'abord des identifiants de candidats; `inspect_candidate` révèle les preuves et `submit_answer` termine le cas sous budget. GenOS, le LLM direct et les cinq adaptateurs concurrents partagent ce contrat. Les tests utilisent des doubles de modèle pour valider les interactions et l'oracle, pas les seuils scientifiques. Le harnais déterministe de référence v1 reste un contrôle de compatibilité sans interaction; ses taux ne sont pas des performances de concurrents.

Le pilote LLM a dépassé le plafond de campagne parce que la reprise a réinitialisé le budget au lieu de conserver le cumul. Le reçu invalide ce résultat et l'écarte des analyses de qualification. Aucun nouvel appel LLM n'est effectué avant révision explicite du budget. La matrice A0–A5 complète n'est pas disponible : A3/A5 restent indisponibles et A2/A4 restent des proxys.

Ordre de grandeur de planification, non résultat de performance : le reçu pilote mesure environ 937 tokens par tentative. Une matrice complète de 12 conditions × 12 épreuves × 3 niveaux × 30 seeds représente 12 960 tentatives, soit environ 12,1 millions de tokens à consommation comparable. L'estimation est incertaine et nécessite un budget explicite supérieur au plafond actuel de 250 000.

Les exécutables originaux Voyager, AI Scientist v2 et DGM ne sont pas installés : les cinq adaptateurs sont des politiques séparées, promptées par le même modèle, et ne prétendent pas reproduire ces systèmes. Les reçus runtime v1 ne sont pas repris sous le schéma v2, car l'observation et la preuve d'inspection ont changé; les rapports historiques restent descriptifs pour l'ancien protocole.

La matrice A0–A5 est qualifiée dans `configs/ablations.yaml` : A0/A1 disposent d'une condition runtime directe, A2/A4 sont des proxys partiels, A3/A5 ne sont pas implémentées. Les portes de vérification et de reprise ne sont pas désactivées pour fabriquer ces ablations. Le reçu `runtime-priority-pilot-qwen7b.json` est invalidé et marqué supersédé : son adaptateur oracle omettait des références de preuve obligatoires. Le pilote Qwen 0.5B est conservé comme échec de format, pas comme résultat de performance.

Une seed sur 12 scénarios × 3 niveaux × 9 systèmes est seulement descriptive. Le protocole à 30 seeds et à six ablations complètes ne tient pas dans le plafond de 250 000 tokens observé ici ; les seuils ETT-L1 à ETT-L5 restent non qualifiés. Aucun effet causal, classement comparatif ou succès scientifique n'est revendiqué.
