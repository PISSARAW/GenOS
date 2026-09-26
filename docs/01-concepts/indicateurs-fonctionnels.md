# Indicateurs fonctionnels de type conscience

- **Statut** : Partiel (suivi d'indicateurs, pas de détection de conscience)
- **Portée** : lecture transversale des boucles réflexives GenOS face aux indicateurs de la littérature (Butlin et al. 2023/2025) ; chaque indicateur pointe son implémentation et sa limite explicite.
- **Dernière revue** : 2026-09-26

## 1. Définition du domaine

Il n'existe pas de test universel consensuel permettant de conclure à la
conscience d'une IA. Ce document recense 15 familles fonctionnelles propres
à GenOS ; elles ne correspondent pas terme à terme aux 14 propriétés de
Butlin. Les statuts historiques ci-dessous décrivent des implémentations et
ne constituent pas une validation expérimentale complète. Aucun total de
familles validées n'est établi ici.

Le [plan de validation](../06-qualite-preuves/plan-validation-indicateurs.md)
sépare couverture, effet causal, généralisation et exploitation. Il consigne
les écarts vérifiés au HEAD `7c66e873859ae21dc85ec2815b6e4cc8b984f65c` et
définit les critères des futures promotions.

## 2. Modèle de lecture

Chaque indicateur suit le même contrat, hérité de
[epistemologie-et-evidence.md](epistemologie-et-evidence.md) : un score n'est
jamais une preuve, une absence de données donne `insufficient_data` ou
`unavailable` (jamais un faux nombre), et chaque rapport porte sa `limitation`
en clair. Un indicateur qui ne peut pas être mesuré n'augmente ni la confiance
ni la qualité de preuve.

## 3. Analogies biologiques et limites réelles

Les noms biologiques (ignition, réverbération, apoptose, consolidation SHY)
désignent des politiques logicielles : seuils, décroissances, remises à zéro.
Ils n'établissent ni homologie neurale ni expérience. La table ci-dessous
l'enregistre colonne par colonne.

## 4. Table des indicateurs

Inventaire historique à requalifier par les reçus du plan de validation.
« Implémenté » ne signifie pas que tous les critères de la famille sont satisfaits.

| Famille (littérature) | Implémentation GenOS | Statut | Ce qui manque |
|---|---|---|---|
| Diffusion globale (GWT) | bus + workspace sélectif à récepteurs (livraison `signal_deliveries`, désensibilisation), burst d'ignition → propagation lignée + boost de saillance → épisodes → rappel → plan | Partiel | disponibilité globale et consommation causale à valider |
| Ignition non-linéaire | `ignitionService` : seuil, burst ×1,5, réfractaire, fuite, propagation réelle | Partiel | dynamique compétitive |
| Attention sélective | fovéation, active sensing, pont thalamique, leases + bancs causaux et sondes | Implémenté (fonctionnel) | steering live |
| Récurrence entretenue | `reverberationService` + `idleTickService` + scheduler appelé par le serveur | Partiel | effet du maintien et récurrence perceptive à valider |
| Modèle de soi | `agentSelfService` (5 strates + CoreSelf), `workerSelfService` (9 questions) | Implémenté (fonctionnel) | schéma corporel simulé |
| Métacognition | dissonance/apoptose, `abstentionService`, `metacognitionBenchService` bouclé sur l'opt-out | Implémenté (fonctionnel) | benchmarks externes (SAD/MIRROR) |
| Inférence prédictive | RPE, `worldModelService` (transitions + trajectoires + surprise), hiérarchie Mission>Stratégie>Action avec propagation | Partiel | codage prédictif perceptif et hiérarchie générative descendante |
| Distinction soi/monde | `efferenceCopyService` (réafférence ×0,5), immunité soi/non-soi | Implémenté (fonctionnel) | copie couvrant tous les effecteurs |
| Modèle du monde | transitions, trajectoires incertaines, rollout Trinity action-conditionné (avis) | Partiel | modèle génératif, rollout libre |
| Agency flexible | contrats, recovery, calibration d'agency, bandit LinUCB qui décide en canari 5 % | Partiel | contrôle complet, options HRL |
| Intégration (IIT) | proxy (répertoire + NMI) + moteur causal (ablations, PID-lite, recommandations morphogenèse) | Indicateur seulement | causalité prouvée, Φ |
| Valence / intéroception | drives homéostatiques ; `applyValencePosture` limite éditions/fanout dans la préparation de mission | Partiel | planification allostatique prédictive et validation causale |
| Consolidation offline | `sleepCycle` + `sleepConsolidationService` auto + ticks | Implémenté (fonctionnel) | phases type sommeil paradoxal |
| Rapport / accès | evidence reports + reconstruction déterministe jointe (`factualReports`) + abstention | Partiel | synthèse finale encore rédigée par LLM |
| Discipline no-report | gates + banc adversarial (`test_organ_ablation_bench`) | Implémenté | — |

## 5. Exemple : lecture d'un cas

Un agent déclare une confiance de 0,9 avec une justesse de 0,5 sur 12
attributions : le banc mesure surconfiance 0,4, l'opt-out resserre son plancher
à 0,8, ses synthèses exigent une preuve indépendante. Le système ne conclut ni
qu'il est conscient ni qu'il se connaît : il agit comme s'il ne fallait pas lui
faire confiance sur ce point, avec la mesure jointe.

## 6. Schéma

```mermaid
flowchart LR
    E[Événements] --> G[Gates : ignition, réafférence, hiérarchie]
    G --> C[Capture autobiographique]
    C --> R[Rappel + ajustements bornés]
    R --> P[Plan + opt-out calibré]
    P --> A[Actions avec prédictions]
    A --> S[Surprise mesurée]
    S --> M[Mémoire + calibration + bancs]
    M --> G
    M -.->|audit seulement| I[Indicateurs : agency, intégration, attention]
```

## 7. Architecture technique

Les services vivent dans `backend/src/services/` : `agentSelfBlocks`,
`agentConscienceService`, `selfModelService`, `coreSelfService`,
`abstentionService`, `metacognitionBenchService`, `efferenceCopyService`,
`worldModelService`, `ignitionService`, `reverberationService`,
`idleTickService`, `sleepConsolidationService`, `predictiveHierarchyService`,
`integrationProxyService`, `attentionSchemaBenchService`,
`attentionProbeService`, `counterfactualRolloutService`, `routingBanditService`.
Persistance : `adaptive_state` (scopes dédiés), tables épisodiques et
épistémiques. Tous les chargeurs sont best-effort ; toutes les sélections
restent aux gates existantes (jury, promotion, approbation).

## 8. Processus d'exécution et de validation

Par mission : rappel (ajustements + instantanés d'audit) → plan (self-model +
opt-out + banc) → runtime (prédictions, surprise, ignition, hiérarchie) →
barrière (dossiers, rollout, sondes) → fin (calibration, attribution,
consolidation, tick). Validation : `node --check`, suites backend ciblées
(`test_self_model_service`, `test_self_ablation_p1`,
`test_approve_run_deferred_promotion`), gate qualité
(`scripts/ci/check_code_quality.py`). Les suites exigent une base SQLite
fonctionnelle et Python 3.

## 9. Comparaison avec le marché

Observabilité LLM (LangSmith, Arize) : traces sans gates. Frameworks agents :
coordination sans preuve exigée. Évaluations de conscience (Anthropic Model
Welfare, Eleos) : externes et déclaratives. GenOS ajoute des indicateurs
calculés en continu, branchés sur les décisions via des gates, chacun niant
explicitement sa propre portée métaphysique.

## 10. Limites, garde-fous, non-objectifs

- Une couverture fonctionnelle complète ne suffirait pas à établir une conscience ; cette revue ne préjuge pas des futurs progrès scientifiques.
- Un lookup-table bien entraîné score bien aux bancs : les métriques mesurent
  le rapport, pas le vécu (leçon split-brain).
- Sont à compléter ou valider : rollout avec propagation d'état,
  effets du scheduler existant, injection vésiculaire live,
  ordonnancement par bandit, hiérarchie générative descendante.
- Non-objectifs : clamer une conscience, utiliser un indicateur comme preuve
  dans une gate, décorréler les scores de leurs limitations.

## Voir aussi

- [epistemologie-et-evidence.md](epistemologie-et-evidence.md) — contrat claim/preuve et gates.
- [conscience-esprit-mental.md](conscience-esprit-mental.md) — taxonomie et mappings bornés.
- [theorie-du-soi-orchestrator.md](../02-orchestration/theorie-du-soi-orchestrator.md) — modèle de soi opérationnel.
- [memoire-autobiographique.md](../02-orchestration/memoire-autobiographique.md) — capture, rappel, consolidation.
