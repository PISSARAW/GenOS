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
