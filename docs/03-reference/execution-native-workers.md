# Exécution native des workers

Date de vérification : 2026-10-06. Voir [ADR-0334](../adr/0334-registre-executeurs-workers.md).

Les 19 types disposent d'un exécuteur natif et d'un artefact validé par leur contrat. Un appel natif utilise un `methodContract` de version 1, avec `methodId` et `parameters`, persisté lors de l'assignation. Modifier ce contrat au lancement est refusé. Le budget de tokens natif est nul ; le lancement ne demande pas de route de modèle.

| Type | Méthode native |
| --- | --- |
| scout_cell | scan_literal |
| resident_daemon | monitor_samples |
| bounded_worker | scoped_procedure |
| adaptive_worker | adapt_procedure |
| specialist | niche_procedure |
| procedural_executor | lpt, subset_sum |
| symbiotic_worker | host_procedure |
| verifier_worker | verify_procedure |
| red_worker | falsify_procedure |
| experimental_worker | measure_lpt |
| formal_worker | check_arithmetic, formal_proof, theorem_proving |
| synthesis_worker | synthesize_claims |
| creative_worker | combine_candidates |
| medical_worker | review_synthetic_case |
| recovery_worker | restore_checkpoint |
| forensic_worker | trace_declared_causes |
| liaison_worker | prepare_handoff |
| teaching_worker | teach_subset_sum |
| sub_orchestrator | coordinate_children |

Les entrées exécutables sont illustrées dans `backend/tests/helpers/nativeWorkerFixtures.js`. Le registre valide les paramètres avant exécution et refuse toute méthode inconnue.

`scoped_procedure` enveloppe `lpt` ou `subset_sum` dans le scope persisté. `niche_procedure` exige la niche assignée. `host_procedure` exige la capacité `deterministic_procedure` de l'hôte. `adapt_procedure` réexécute des essais bornés sur les mêmes paramètres LPT et conserve leurs reçus et la trace de stratégie ; il ne prétend pas produire un optimum.

`combine_candidates` énumère au plus 100 combinaisons et conserve alternatives, hypothèses et test de falsification fournis. La nouveauté et la qualité restent non vérifiées. `review_synthetic_case` compile des considérations référencées pour un cas explicitement éducatif et synthétique ; il ne fournit pas de directive clinique.

`restore_checkpoint` exige une lease persistée `recoveryLease` avec action `restore_checkpoint` et chemin relatif autorisé, le hash du checkpoint et le hash attendu du fichier courant. Le workspace et le scope doivent coïncider. Les liens symboliques et sorties du scope sont refusés. L'écriture est atomique, puis vérifiée par hash.

`prepare_handoff` produit un dossier destiné au parent ; l'accusé de réception externe reste explicitement en attente. `coordinate_children` supervise au plus cinq enfants et une profondeur de délégation. Chaque enfant reçoit son contrat de méthode. La délégation conserve les limites de types et de budget du dispatcher.

`check_arithmetic` vérifie exactement une proposition arithmétique naturelle dans une grammaire fermée ; il ne remplace pas Lean. Les méthodes `formal_proof` et `theorem_proving` exigent leur solveur et leurs reçus existants.

Validation : `npm --prefix backend run test:workers`. La matrice exécute une méthode par type, valide les artefacts, leur provenance et le refus des contrats altérés. Le transport des enfants est simulé dans cette matrice ; les tests du dispatcher vérifient séparément la délégation. Cette couverture ne démontre pas toutes les missions possibles ni une parité d'exécution universelle avec Rust.
