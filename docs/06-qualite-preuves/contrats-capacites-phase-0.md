# Contrats d'acceptation Phase 0 — sept capacités manquantes

- **Statut** : phase 1 écartée (SQLite reste la seule base supportée) ; phases 2–7 disposent de parcours ou prototypes partiels, sans validation complète des capacités de bout en bout.
- **Portée** : figer les contrats des phases 1 à 7 avant tout code.
- **Dernière revue** : 2026-09-28
- **Références** : [statuts-maturite.md](statuts-maturite.md), [registre-services.md](registre-services.md), [plan-validation-indicateurs.md](plan-validation-indicateurs.md), ADR 0162.

Règle transversale : un succès de transport n'est pas une décision valide. Aucun statut ne passe à `actif` ou `implémenté` sur la seule présence d'un module, d'un nom dans un catalogue ou d'une équation dans la documentation. Chaque capacité suit le parcours `entrée → sélection → invocation → effet sur la décision → action → observation → persistance → réutilisation` prouvé par test et reçu versionné.

## 0. Quatre niveaux de preuve (rappel ADR 0162)

| Niveau | Sens | Correspondance registre |
|---|---|---|
| `code-présent` | Fichier et fonction existent, tests unitaires éventuels | `bibliothèque` ou `à classer` |
| `branché-runtime` | Appelé par un chemin de production (route, CLI, lease, scheduler) | `expérimental` minimum |
| `validé` | Parcours nominal + refus + limites couverts par tests, reçu versionné persisté | `expérimental` complet, candidat à `actif` |
| `annonçable` | Validé + matrice de câblage + documentation et exemples à jour | `actif` |

## 1. Portabilité du stockage (phase 1 — PostgreSQL écarté)

- **Décision de portée** : SQLite reste le stockage portable supporté. Ne pas ajouter de backend PostgreSQL tant que bootstrap, migrations, SQL, fonctionnalités SQLite (FTS, `rowid`, vecteurs, sauvegarde) et suites n'ont pas une parité démontrée. Un adaptateur de connexion seul ne satisfait pas cette exigence.
- **Statut** : phase fermée comme non retenue dans cette feuille de route ; aucune compatibilité PostgreSQL n'est annoncée. Toute réouverture exige une décision explicite et une preuve de portabilité complète.


## 2. Moteur d'évaluation des indicateurs (phase 2)

- **Avancement** : l'évaluateur vérifie chaque reçu, agrège plusieurs reçus par propriété avec priorité conservatrice aux statuts négatifs/inconnus, et persiste le rapport comme reçu versionné dans SQLite, avec hash, événement transactionnel et idempotence. `--persist` est explicite. Aucun score agrégé ni promotion automatique n'est produit.

- **Interface** : `backend/bin/genos-indicators.cjs evaluate [--persist]` + `indicatorReceiptService` + `indicatorEvaluationPersistenceService` (reçu ou `{receipts: [...]}` JSON sur stdin).
- **Entrées** : reçu versionné (`propriété`, `profil`, `protocole`, `version`, `résultat`, `artefacts`, `limites`, `provenance`). Profils `node-runtime`, `rust-runtime`, `composed-api` ; `composed-perceptual` reste `planned` sans substrat instrumenté.
- **Sorties** : état par étape (`specified`, `implemented`, `causal`, `generalized`, `operational`) parmi `passed`, `failed`, `inconclusive`, `not_run`, `unavailable` ; rapport traçable.
- **Erreurs** : `RECEIPT_SCHEMA_UNKNOWN`, `RECEIPT_REF_MISSING`, `RECEIPT_EVIDENCE_INCOHERENT`, `RECEIPT_PROFILE_MISMATCH`. Schéma inconnu, référence absente ou preuve incohérente = rejet.
- **Permissions** : lecture seule sur les reçus ; aucune promotion sans reçu valide.
- **Limites** : une étape non évaluée reste `not_run` ou `unavailable`, jamais un succès par défaut ; l'agrégation ne masque aucune propriété échouée ou inconnue ; les indicateurs sont des propriétés fonctionnelles mesurées, pas un score de conscience.
- **Preuves** : tests de cohérence mono/multi-reçus, statuts conservateurs, duplicats, reçus invalides et profils incompatibles ; persistance SQLite, hash de rapport, idempotence et événement. Ces preuves valident le moteur, pas les propriétés mesurées elles-mêmes.

## 3. Mécanismes Rhizome (phase 3)

- **Avancement** : `mergePolicyEvaluationService.evaluateMerge` calcule une décision bornée depuis des métriques explicites, refuse les révisions de graphe périmées et produit un hash de reçu. Cette fonction reste isolée : elle n'est pas encore branchée aux opérations de fusion, de pruning, de transfert ni au bail runtime.

- **Interface** : fonctions déterministes isolées puis raccordées au graphe (`rhizomeCoordinationService`, politiques de fusion, pruning, transfert, bail).
- **Entrées** : fitness de pont, variance de latence, score de provenance, couverture globale `C_min`, fitness minimale `F_min`, seuil de fiabilité du transfert, bail fondé sur la stabilité — chacun avec unité, source de données et politique d'usage.
- **Sorties** : valeurs dérivées + décision reproductible (`canMerge` et équivalents) + reçu (entrées, valeurs, seuils, décision, données manquantes).
- **Erreurs** : `RHIZOME_DATA_MISSING`, `RHIZOME_GRAPH_STALE`, `RHIZOME_POLICY_UNDEFINED`. Valeur absente ou sous-documentée = `unknown`, jamais une estimation silencieuse.
- **Permissions** : décisions bornées par budget et profondeur ; aucun contournement des gates d'admission.
- **Limites** : benchmarks seulement après tests de correction ; graphes déconnectés, valeurs manquantes, données adverses et graphes obsolètes testés.
- **Preuves** : chaque garantie documentée au §3.9 de `rhizome.md` est calculée depuis des données explicites et reproductible.

## 4. Validation causale étendue (phase 4)

- **Avancement** : `replicatedCausalValidationService.runReplicatedExperiment` exécute des bras appariés sur au moins trois seeds, clone le même état initial pour chaque bras, vérifie l'empreinte de l'environnement et produit un reçu causal ; la persistance est optionnelle. Le runner fourni par l'appelant n'est pas encore relié à un parcours de mission ou au registre de causalité.

- **Interface** : `proceduralCausalValidationService` étendu + registre des runs + `causalDiff` persistant.
- **Entrées** : intervention (variable manipulée, groupe témoin, environnement, budget, état initial, résultat observé), snapshot initial sérialisé, seeds.
- **Sorties** : forks isolés baseline/intervention vérifiés (identité avant, indépendance pendant), écarts par intervention avec incertitude quand le protocole le permet, attribution bornée (ce qui est attribuable et ce qui reste indéterminé).
- **Erreurs** : `CAUSAL_SNAPSHOT_MISMATCH`, `CAUSAL_ARM_FAILED`, `CAUSAL_SEED_INVALID`, `CAUSAL_ENV_DRIFT`, `CAUSAL_NO_MEASURABLE_EFFECT`, `CAUSAL_PROTOCOL_INSUFFICIENT`.
- **Permissions** : exécution isolée, budgets comparables entre bras, multi-seeds sur états comparables.
- **Limites** : une différence de résultats ne suffit pas à établir une cause ; une décision causale sans snapshot, intervention, témoin, répétitions et résultats comparables est refusée. Le vocabulaire `causality_fork` / `mutatedUniverses` / `causalDiff` n'est employé que lorsque les mécanismes correspondants sont câblés.
- **Preuves** : `causalDiff` reliant divergences, étapes et artefacts ; tests d'annulation, échec d'un bras, seed invalide, dérive et divergence sans effet.

## 5. Service de cognition sociale (phase 5)

- **Avancement** : `cognitionService` expose `social-cognition.position-map` via le routeur philosophique. La carte descriptive exige acteurs, sources/provenance, contexte et relations déclarés ; elle retourne inconnues/désaccords explicitement fournis et refuse l'élévation en autorité. Validée dans ce périmètre descriptif, sans prétention à inférer états mentaux ou vérité.

- **Interface** : `cognitionService` + adaptateur au routeur philosophique + définitions au registre de maturité.
- **Entrées** : schéma structuré — acteurs déclarés, affirmations, sources, contexte, incertitudes, relations. Analyse des seules informations explicitement fournies.
- **Sorties** : cartographie des positions, désaccords repérés, comparaison des sources, inconnues retournées. Résultats descriptifs et révisables, avec provenance conservée.
- **Erreurs** : `SOCIAL_ACTOR_UNKNOWN`, `SOCIAL_PROVENANCE_MISSING`, `SOCIAL_CONTEXT_INSUFFICIENT`, `SOCIAL_AUTHORITY_REFUSED`.
- **Permissions** : aucune déduction de vérité, d'intention ou de permission d'exécution à partir d'un score social ; toute tentative d'usage comme autorité runtime est refusée explicitement.
- **Limites** : « cognition sociale » désigne l'analyse d'informations sociales fournies, pas la lecture d'états mentaux ; échec explicite quand le contexte ne permet pas de conclure.
- **Preuves** : entrées invalides, acteurs inconnus, preuves contradictoires, provenance manquante et tentatives d'élévation d'autorité testés.

## 6. Intégration Antigravity (phase 6)

- **Avancement** : `integrations/antigravity/configure-mcp.cjs` prépare une entrée MCP stdio en conservant les autres serveurs et en appliquant un bail par défaut limité à `genos_snapshot`. Cela vérifie la configuration, pas une session réelle ni une certification de l'IDE.

- **Interface** : adaptateur versionné du contrat `genos.ide/v1` (si réalisable), sinon statut de client générique non certifié.
- **Entrées** : protocole d'extension réellement offert par Antigravity (versions, APIs), authentification, scopes workspace, diagnostics, progression de tâche.
- **Sorties** : parcours IDE réel, reproductible et versionné ; opérations fichier via primitives VFS et leases.
- **Erreurs** : `IDE_ADAPTER_MISSING`, `IDE_AUTH_FAILED`, `IDE_SCOPE_DENIED`, `IDE_PROGRESS_EXPIRED`, `IDE_VERSION_MISMATCH`.
- **Permissions** : scopes workspace appliqués ; refus d'accès testés.
- **Limites** : la seule acceptation du contrat HTTP/gRPC ne suffit pas à annoncer la compatibilité ; version testée et limites publiées.
- **Preuves** : installation propre, session longue, fermeture/réouverture, expiration de progression, refus d'accès.

## 7. Constantes physiques par type de mission (phase 7)

- **Avancement** : `missionPhysicsParameterService` estime une valeur bornée depuis des échantillons d'entraînement et de validation, persiste un reçu versionné en état `candidate`, exige une activation et permet le rollback vers la version antérieure. `adaptiveParameterService.loadFromDatabase` consomme les seuls reçus actifs dont la valeur respecte encore les bornes runtime pour le `missionClass` correspondant. Cela valide le chargement contrôlé, pas un gain de performance généralisable.

- **Interface** : paramètres persistés par type de mission (version, échantillons, provenance, bornes, incertitude), séparés des valeurs par défaut.
- **Entrées** : constantes paramétrables identifiées, observations admissibles, résultats de mission utilisés comme signal, conditions minimales d'apprentissage.
- **Sorties** : paramètres appris, bornés, traçables, activés hors chemin critique après validation, avec retour arrière possible.
- **Erreurs** : `PHYSICS_INSUFFICIENT_DATA`, `PHYSICS_BOUND_VIOLATION`, `PHYSICS_VALIDATION_FAILED`.
- **Permissions** : mise à jour hors exécution ; valeurs par défaut utilisées quand les données sont insuffisantes.
- **Limites** : les paramètres appris ne sont pas présentés comme des constantes physiques universelles ; comparaison à budget identique sur missions réservées.
- **Preuves** : données rares, dérive, échantillons contradictoires, résultats extrêmes testés ; amélioration d'un objectif défini sur missions de validation réservées.

## 8. Réconciliations documentaires figées en Phase 0

- **Trinity** : `docs/02-orchestration/topologies/trinity.md` prévaut — `factorial`, `recursive`, `oracular` sont reconnus mais refusés avant lancement. Les modules `trinityFactorialGrid`, `trinityRecursiveExecutor`, `trinityOracle` et les politiques `factorial_grid`, `recursive_nesting`, `oracular_prediction` marquées `implemented` dans `trinityVariantService.js` sont des utilitaires `bibliothèque` tant qu'aucun parcours de lancement ne les invoque avec gate passé. Aucune promotion vers `actif` sans preuve de lancement.
- **Conformité** : `docs/05-securite-gouvernance/conformite-et-gouvernance.md` prévaut — `complianceService` et la CLI `genos compliance` produisent des rapports de couverture de contrôles outillés, pas une conformité réglementaire complète ni une certification. Un score de 100 % signifie que les contrôles vérifiés ont passé.
- **Indicateurs** : les 14 propriétés Butlin et les 15 familles GenOS restent des registres distincts non additionnables ; `composed-perceptual` reste `planned`.

## Voir aussi

- [ADR 0162](../adr/0162-niveaux-preuve-maturite-et-contrats-phase-0.md) — décision des quatre niveaux et du gel des contrats.
- [statuts-maturite.md](statuts-maturite.md) — statuts `actif`, `expérimental`, `bibliothèque`, `obsolète`, `à classer`.
- [registre-services.md](registre-services.md) — fiches et matrice de câblage.
