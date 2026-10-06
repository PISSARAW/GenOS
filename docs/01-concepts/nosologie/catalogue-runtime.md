# Catalogue runtime de nosologie computationnelle

Ce document est généré depuis [shared/nosology.json](../../../shared/nosology.json) par node scripts/docs/generate-nosology-catalog.mjs. Le catalogue couvre **28 conditions**, **9 familles** et **48 contrats de transformation de marqueurs**, dont les 19 noms auparavant absents du runtime. Les autres variantes historiques de SystemicTherapy conservent leurs effets documentés dans la vue d'ensemble.

## Contrat commun

- Les marqueurs sont des mesures logicielles finies dans [0,1]. Un marqueur de condition strictement supérieur à 0,5 suffit à établir cette condition simulée. Une valeur absente ou invalide n'est jamais une preuve de guérison.
- L'application diminue uniquement les cibles présentes et valides, avec un plancher à zéro. Elle conserve les autres marqueurs et ne ressuscite pas une cellule apoptotique.
- Le résultat expose status (applied, no_target ou refused), marker_changes (avant/après), applied_markers, cured_pathologies et induced_side_effects. Un ancien résultat sans statut est unspecified et n'atteste aucune application.
- Une condition existante n'est retirée que si une cible a été modifiée par le traitement et si **tous** ses marqueurs sont présents, valides et inférieurs ou égaux à 0,5. Les autres diagnostics restent conservés.
- Les effets secondaires ci-dessous sont simulés uniquement lorsque leurs marqueurs de risque sont explicitement présents. Ces marqueurs sont bornés à 1 et l'effet constaté est retourné et journalisé. Un marqueur de risque invalide bloque l'application.
- Le tick synchronise les diagnostics sur les cellules actives. Les recommandations issues des marqueurs restent des propositions; elles ne déclenchent aucune mutation thérapeutique automatique.

## Conditions et routage

| Condition simulée | Famille | Marqueurs suivis | Thérapies possibles |
|---|---|---|---|
| Lupus | Auto-immunes | `autoantibody_load` | `SelfToleranceRecalibration`, `ImmunosuppressiveWash` |
| RheumatoidArthritis | Auto-immunes | `joint_inflammation` | `AntiTNFInhibitor` |
| MultipleSclerosis | Auto-immunes | `blood_brain_barrier_deficit` | `BloodBrainBarrierSealing` |
| Type1Diabetes | Auto-immunes | `insulin_signal_deficit` | `ExogenousInsulinInfusion` |
| Alzheimer | Dégénératives | `amyloid_load`, `synaptic_loss` | `AmyloidBetaPlaqueClearance`, `Cd47SynapticRescue` |
| Parkinson | Dégénératives | `dopamine_signal_deficit`, `alpha_synuclein_load`, `neural_activity_instability` | `LevodopaSupplementation`, `AlphaSynucleinDisaggregation`, `DeepBrainStimulation` |
| Osteoarthritis | Dégénératives | `joint_friction`, `matrix_degradation`, `senescent_load` | `Viscosupplementation`, `MmpInhibitorAdministration`, `SenolyticPurge` |
| Influenza | Infectieuses | `influenza_replication_load` | `NeuraminidaseInhibitor` |
| Tuberculosis | Infectieuses | `mycobacterial_load` | `AntitubercularQuadritherapy` |
| Malaria | Infectieuses | `parasite_load` | `AntimalarialACT` |
| HivInfection | Infectieuses | `viral_replication_load` | `AntiretroviralCombination` |
| SickleCellDisease | Génétiques | `fetal_carrier_silencing`, `vascular_adhesion` | `FetalCarrierReactivation`, `AntiAdhesionVasodilator` |
| CysticFibrosis | Génétiques | `cftr_function_deficit` | `CFTRModulatorTriad` |
| DuchenneMuscularDystrophy | Génétiques | `exon_expression_deficit`, `premature_stop_load` | `ExonSkippingAntisense`, `StopCodonReadthrough` |
| LungCancer | Cancers | `lung_tumor_load`, `tumor_vascular_load` | `VascularPruningAndFlush` |
| Leukemia | Cancers | `leukemic_load` | `CartCellInfusion` |
| Melanoma | Cancers | `melanoma_load` | `CartCellInfusion` |
| Type2Diabetes | Métaboliques | `insulin_resistance` | `InsulinSensitizerMetformin` |
| Hypothyroidism | Métaboliques | `thyroid_signal_deficit` | `LevothyroxineHormoneReplacement` |
| Gout | Métaboliques | `purine_inflammation`, `purine_production`, `purine_waste_load` | `ColchicineInhibition`, `AllopurinolXanthineInhibitor`, `LysosomalUraturicPurge` |
| Hypertension | Cardiovasculaires | `vascular_resistance` | `VasodilatorFlowControl` |
| MyocardialInfarction | Cardiovasculaires | `vascular_occlusion`, `perfusion_deficit` | `CoronaryReperfusionThrombolysis`, `IntensiveCareFluids` |
| IschemicStroke | Cardiovasculaires | `astrocytic_waste_load`, `nmda_signal_deficit` | `NeuroprotectiveAstrocyticFlush`, `AntiNmdReadthrough` |
| MajorDepression | Psychiatriques | `synaptic_response_deficit`, `cognitive_resource_deficit`, `monoamine_signal_deficit` | `KetamineRapidInfusion`, `CognitiveResupply`, `MonoamineReuptakeInhibitor` |
| Schizophrenia | Psychiatriques | `cognitive_signal_disorder`, `efference_copy_deficit` | `AntipsychoticAtypical`, `EfferenceCopyReconstruction` |
| BipolarDisorder | Psychiatriques | `affective_instability`, `circadian_disruption` | `MoodStabilizerLithium`, `CircadianRhythmReset`, `AtypicalAntipsychoticMoodStabilizer` |
| Asbestosis | Environnementales | `fibrillar_load` | `FibrillarContextCleansing` |
| LeadPoisoning | Environnementales | `metal_toxin_load` | `ChelationTherapy` |

## Opérateurs de marqueurs

| Identifiant SystemicTherapy | Cibles | Effet borné | Garde | Effet secondaire conditionnel |
|---|---|---|---|---|
| InsulinSensitizerMetformin | `insulin_resistance` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| LevothyroxineHormoneReplacement | `thyroid_signal_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| ColchicineInhibition | `purine_inflammation` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AllopurinolXanthineInhibitor | `purine_production` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| LysosomalUraturicPurge | `purine_waste_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| CoronaryReperfusionThrombolysis | `vascular_occlusion` | −0.25 | blood_brain_barrier_integrity > 0.5 | Aucun effet supplémentaire défini |
| VasodilatorFlowControl | `vascular_resistance` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AntiAdhesionVasodilator | `vascular_adhesion` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AntiNmdReadthrough | `nmda_signal_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| NeuroprotectiveAstrocyticFlush | `astrocytic_waste_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| BloodBrainBarrierSealant | `blood_brain_barrier_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| LevodopaSupplementation | `dopamine_signal_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| DeepBrainStimulation | `neural_activity_instability` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| Viscosupplementation | `joint_friction` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| SenolyticPurge | `senescent_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AntiretroviralCombination | `viral_replication_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AntimalarialACT | `parasite_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| ExonSkippingAntisense | `exon_expression_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| CFTRModulatorTriad | `cftr_function_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| CartCellInfusion | `tumor_load`, `leukemic_load`, `melanoma_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| KetamineRapidInfusion | `synaptic_response_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| MoodStabilizerLithium | `affective_instability` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AntipsychoticAtypical | `cognitive_signal_disorder` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| FetalCarrierReactivation | `fetal_carrier_silencing` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| ChelationTherapy | `metal_toxin_load` | −0.25 | Aucune supplémentaire | cofactor_deficit +0.05 |
| AntiTNFInhibitor | `joint_inflammation` | −0.25 | Aucune supplémentaire | immune_deficit +0.05 |
| BloodBrainBarrierSealing | `blood_brain_barrier_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| ExogenousInsulinInfusion | `insulin_signal_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AmyloidBetaPlaqueClearance | `amyloid_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| Cd47SynapticRescue | `synaptic_loss` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AlphaSynucleinDisaggregation | `alpha_synuclein_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| MmpInhibitorAdministration | `matrix_degradation` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AntitubercularQuadritherapy | `mycobacterial_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| NeuraminidaseInhibitor | `influenza_replication_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| StopCodonReadthrough | `premature_stop_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| VascularPruningAndFlush | `lung_tumor_load`, `tumor_vascular_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| CognitiveResupply | `cognitive_resource_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| MonoamineReuptakeInhibitor | `monoamine_signal_deficit` | −0.25 | Aucune supplémentaire | affective_instability +0.05 |
| EfferenceCopyReconstruction | `efference_copy_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| NmdaAllostericModulator | `nmda_signal_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| CircadianRhythmReset | `circadian_disruption` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| AtypicalAntipsychoticMoodStabilizer | `affective_instability` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| FibrillarContextCleansing | `fibrillar_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| BloodBrainBarrierRestoration | `blood_brain_barrier_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| IntensiveCareFluids | `perfusion_deficit` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| Antibiotic | `bacterial_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| SelfToleranceRecalibration | `autoantibody_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |
| ImmunosuppressiveWash | `autoantibody_load` | −0.25 | Aucune supplémentaire | Aucun effet supplémentaire défini |

## Exécution persistante

La CLI genos biomimicry therapy --agent-id <cell_id> --therapy-type <identifiant-ou-JSON> --journal <journal> --authorization-file <autorisation> restaure la population et utilise une autorisation signée, liée à la mission, au génome, à l'état cellulaire et au reçu source. Les fichiers doivent rester dans GENOS_WORKSPACE_ROOT. L'API existante POST /api/rust/clinical-authorizations vérifie l'approbateur, le tenant, la population courante et les types du catalogue avant de signer.

Chaque tentative autorisée produit un reçu durable avec son statut. Sans effet, treatment_administered et success restent faux. Une nouvelle présentation de la même autorisation renvoie le reçu existant et n'applique pas une seconde mutation. La mémoire est mise à jour seulement après la persistance du reçu et de la population. Une signature invalide ou un état changé est refusé avant mutation.

L'exposition MCP dépend du catalogue d'outils et de la lease du client; la présence d'un opérateur Rust ne lui accorde aucun accès MCP automatique. La persistance ne dispense d'aucune preuve ni autorisation.

## Limites et vérification

Les identifiants inspirés de maladies et de médicaments désignent des abstractions GenOS. Les paramètres biologiques et pseudo-code des anciennes fiches ne sont pas des paramètres médicaux exécutables. Ce catalogue ne constitue ni un diagnostic médical humain ni une validation de traitement.

Les tests de crates/genos-biology/tests/nosology_catalog.rs parcourent toutes les conditions et tous les opérateurs; crates/genos-orchestrator/tests/nosology_authorization.rs vérifie le reçu, la restauration, les refus et l'idempotence. Le backend vérifie les types avec backend/tests/test_nosology_catalog.js. Exécution ciblée : cargo test -p genos-biology et cargo test -p genos-orchestrator --features api --test nosology_authorization (la persistance requiert cette feature). Vérification de ce document : node scripts/docs/generate-nosology-catalog.mjs --check.
