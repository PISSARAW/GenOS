# Vérifications ETT-BENCH

Date : 2026-10-27. Résultats observés dans le workspace, sans inférer la réussite des commandes interrompues ou échouées.

| Commande | Résultat | Détail |
| --- | --- | --- |
| `npm --prefix backend run test:ett` | Réussi | Contrats, reprise multicycle, intégration campagne et frontières de preuve passés. La commande a fini avant que le runner synthétique lancé dans la même session n'échoue initialement faute de dossier de sortie ; elle a ensuite été suivie d'une relance réussie du pilote. |
| `node benchmarks/ett/tests/test_statistics.js` | Réussi | Bootstrap apparié hiérarchique déterministe, correction de Holm et contrat de CLI. |
| `node backend/bin/genos-ett-campaign.cjs --output benchmarks/ett/reports/development-pilot.json` | Réussi | 18 cas × 7 conditions ; reçu de développement synthétique, non scientifique. Voir le JSON voisin. |
| `cargo test --workspace` | Réussi | Code de sortie 0, tests et tests de documentation du workspace terminés. Des avertissements Rust préexistants ont été affichés. |
| `npm test` | Réussi | Code de sortie 0 après correction des fixtures de réparation bornée, d'écriture d'artefact local et d'enveloppe G-CIR. Le profil workers a passé 39 suites ; les profils `garage` et `p1-v3` ont également passé. |
| `npm --prefix backend run test:p1-socle` | Réussi | Autorité, oracles natifs, mémoire/récupération, références scientifiques, ETT et portes de promotion passés. |
| `node backend/tests/test_worker_code_unsafe_proposal_retry.js` | Réussi | Vérifie le wrapper `WORKER_TEST_REPAIR_NO_PROGRESS` et l'arrêt après deux erreurs identiques. |
| `node backend/tests/test_mission_authority_envelope.js` | Réussi | Probe local adapté au contrat JSON `artifactText`. |
| `node backend/tests/test_gcir_scientific_visibility.js` | Réussi | Opérations de fixture incluent désormais le champ `state` requis par le schéma. |
| `python scripts/ci/check_code_quality.py` | Échec | Le dépôt rapporte 176 violations de complexité/paramètres (173 nouvelles relativement à sa base). Aucun des nouveaux fichiers ETT n'apparaît dans les rejets affichés. |
| `git diff --check` | Réussi | Aucun problème d'espacement de diff. |

La porte de qualité complète reste rouge à cause de la dette du dépôt ; les nouveaux fichiers ETT ne produisent aucune violation propre. Le pilote décrit dans le reçu adjacent n'est pas une qualification scientifique ETT.

## Harnais de référence exécutable

Commande : `node benchmarks/ett/run_reference_campaign.js --seeds 30 --output <fichier-temporaire>` (2026-10-27).

| Vérification | Résultat | Limite |
| --- | --- | --- |
| Couverture | 12 scénarios × 3 difficultés × 30 seeds × 8 systèmes = 8 640 tentatives | Monde générique d'identification par indices, non 12 environnements spécialisés. |
| Exécutions | 0 erreur d'adaptateur pour chacun des huit systèmes | Politiques déterministes locales, aucune API LLM. |
| Taux de réponse vérifiée (descriptive) | GenOS ETT proxy 100 % ; sans curiosité 23,61 % ; sans mémoire 100 % ; ReAct proxy 100 % ; boucle périodique 23,61 % ; Voyager proxy 36,76 % ; AI Scientist proxy 49,54 % ; DGM proxy 23,52 % | Ces taux mesurent uniquement ce monde jouet ; aucune inférence de supériorité ou fidélité aux systèmes originaux. |
| Oracle | Vérificateur lancé en processus enfant ; aucun secret transmis à `solve` | Isolation de processus locale, pas une frontière résistante à l'opérateur de la machine. |
| Coût | Temps hôte rapporté par exécution | Tokens et coût fournisseur non mesurés. Le reçu dit `externalModelCostsMeasured: false` et `scientificClaimAllowed: false`. |

Le reçu complet de cette exécution a été écrit dans le dossier temporaire local `ett-reference-30seed.json`, pas ajouté au dépôt. Une reproduction peut choisir son propre chemin de sortie inédit. La porte qualité complète demeure à 176 violations (173 au-dessus de la baseline), identique au contrôle précédent ; cette modification n'a ajouté aucune violation au gate.
