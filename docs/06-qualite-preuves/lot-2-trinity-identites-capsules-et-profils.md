# Lot 2 Trinity — Identités, capsules et profils

- **Date** : 2026-10-06
- **Statut** : Correctifs implémentés ; validation globale détaillée ci-dessous.
- **Base du lot** : `7617c23209a135f1353195b4738213ec392294b1`, commit du lot L1.
- **Architecture** : [ADR 0342](../adr/0342-trinity-identites-capsules-et-profils-executables.md).
- **Périmètre** : identités, bootstrap/capsules/snapshots, profils et prévalidation.

Le lot répond aux causes communes de l'[audit approfondi](audit-trinity-2026-10-06/composants-et-causes.md)
et à la suite définie dans le [rapport L1](lot-1-trinity-contrats-et-traces.md).
Les 48 missions, 88 tentatives, 324 mondes et 71 PASS historiques ne sont pas
modifiés. Aucun monde historique n'est requalifié ni promu par les tests L2.

## Causes et correctifs

| Problème | Correction branchée | Contrôle négatif |
| --- | --- | --- |
| Le caller omet `missionId`, puis le résolveur traite plusieurs missions actives comme ambiguës | `missionPlanning.createMissionExecutionRun` transmet l'identité de mission biologique ; `biologicalWorkerStore.bindRun` utilise `trinityWorkerIdentity` | Mission demandée non assignée, inactive, identité worker utilisée comme mission ou plusieurs missions sans sélection : refus |
| Le même code masque zéro et plusieurs correspondances | `NOT_FOUND` avec `reason=none` et cause précise ; `AMBIGUOUS` avec `reason=multiple` ; candidats, assignations et statuts dans le diagnostic | Aucun choix automatique d'une autre mission |
| L'erreur perd ses détails après rollback | Événement `BIOLOGICAL_WORKER_MISSION_REJECTED` écrit après la transaction, avec origine serveur et tenant dérivé de la DB | Erreur forgée, mauvais worker/base et diagnostic réécrit ignorés ; le rejet initial survit à une erreur de persistance |
| L'identité dépend d'un workspace identique à celui du parent | Comparaison des tenants persistés, avec workspace privé distinct autorisé | Tenant étranger, agent absent et workspace référencé mais absent refusés ; parent connu sans workspace et tenant nul conservé |
| Un ID temporel de capsule est affiché sans correspondre aux fichiers présents | Chemin stable dérivé de mission/monde/worker/run ; prompt utilisant les vrais ID et chemins | Descripteur, identité de monde ou reprise avec paramètres modifiés refusés |
| Le root annoncé au bootstrap diffère du stockage réellement utilisé par Rust | `GENOS_STUDIO_ROOT` et `GENOS_ROOT` transmis au processus avec le root isolé ; vérification du JSON réellement persisté | Résultat natif incohérent ou fichier de capsule altéré refusé |
| Les fichiers sont hachés sans ancre indépendante | Ancre SQLite immuable `trinity_capsule_seals`, puis trace `capsule_binding` liée au manifeste L1 | Fichiers et seal recalculés ensemble refusés lors de la reprise |
| `mkdtemp` reçoit un parent absent | Root créé et contrôlé avant staging ; reprise du snapshot vérifiée | Manifest mal formé, bytes/tailles/hash modifiés, extras, chemins dangereux, liens ou jonctions refusés |
| Des scénarios d'architecture sont routés vers des auteurs littéraires | Priorité technique lors de la résolution du profil créatif ; WorkerKinds techniques avant dispatch | Fiction conservée ; capacité ou méthode incompatible refusée |
| La diversité est un nom de recette sans rôle correspondant | Monde 3 hétérogène affecté à `adversarial_reviewer` / `red_worker` ; contraintes de qualification conservées | Routes identiques et score sous 0,35 refusés avant création de mondes |
| Factorial annonce des facteurs sans traitement cohérent | 16 cellules : recette de l'approche, profondeur de validation, route explicite et réplication cohérentes | Deux aliases d'une même route, niveau sans modèle ou routes contradictoires dans un même niveau refusés |
| Le phénotype écrase la recette Trinity | `requestedCognitiveRecipe` conservée ; profil indiquant `requested_strategy` et `observedRecipe=null` | Test de trois phénotypes avec instructions non vides et stratégie conservée |
| Le modèle demandé est pris pour une observation du runtime | Observation du lanceur réellement invoqué, liée au run/PID, avec hashes des fichiers et des arguments | Faux provider/modèle, identité étrangère, manifest absent et observation modifiée refusés |

## Chaîne d'exécution effective

Le chemin de dispatch compose les membres, résout leur WorkerKind et calcule les
leases par monde depuis le même constructeur que le lanceur. La prévalidation
s'exécute dans la phase `prelaunch`, avant scellage de l'expérience et création des
mondes. Les profils sont ensuite conservés dans le design. Le chemin autonome
`trinityModelDiversityService.enforcePlan` réalise aussi une prévalidation avant
déploiement ; les réductions de leases ultérieures restent contrôlées au runtime.

Le bootstrap résout l'autorité, le workspace, le contrat et le budget avant de
créer le run. Il provisionne alors la capsule corrélée au véritable run. La capsule
native est vérifiée contre le JSON persisté ; un fallback synthétique porte
`bootstrapMode=synthetic` et son motif. Le fallback n'est pas compté comme un succès
Rust natif et ne valide pas la mission.

`trinityQualificationDispatch.recordStarted` lie le snapshot de capsule au
manifeste et ancre les hashes dans une trace append-only. Avant invocation native
en processus ou envoi de la mission au processus supervisé,
`trinityRuntimeAttestation` vérifie cette liaison. Le superviseur observe les
fichiers du lanceur, le répertoire réel et le PID. Un défaut de provenance après
spawn demande l'arrêt du processus au lieu de lui transmettre la mission.

L'observation du lanceur garde `provider=null`, `model=null`,
`dependencies=not-captured` et `decisionAuthority=none`. Le manifeste L1 n'est pas
réécrit pour inventer une observation de modèle. Une empreinte de fichier capturée
avant invocation n'est pas une preuve atomique de tous les bytes ensuite chargés.

## Effet sur les variants

| Variant | Effet L2 | Ce qui reste à démontrer |
| --- | --- | --- |
| Controlled | Liaison exacte, trois profils et capsules cohérents | Clôture, vérification indépendante et comparaison |
| Heterogeneous | Trois profils distincts demandés, falsificateur typé, seuil 0,35 conservé | Routes réellement observées et diversité effective ; aucune indépendance cognitive déduite des noms |
| Factorial | 16 traitements cohérents ; deux routes distinctes, aliases normalisés | Exécution observée des niveaux et réplications, puis analyse factorielle |
| Pareto | Profil/capacités/runtime demandé conservés | Mesures indépendantes de toutes les dimensions et dominance valide |
| Adversarial | Falsificateur typé ; contrat public conservé dans le prompt d'attaque | Objection exécutée, réponse et arbitrage sur preuves scellées |
| Counterfactual | Identités et capsules des mondes séparées | Intervention causale contrôlée et rejeu comparable |
| Temporal | Run et snapshot réellement identifiés | Ordre temporel des observations et extrapolation vérifiée |
| Oracular | Bootstrap corrélé, absence de preuve de modèle maintenue | Prédiction scellée avant observation et réplications indépendantes |
| Jury | Architecture routée vers des profils techniques | Votes consultatifs effectivement obtenus après comparaison et calibration |
| Recursive | Identité explicite, prévalidation et refus disponibles | Exécution/clôture des enfants, budgets et promotion vérifiée |
| Adaptive | Stratégie demandée préservée malgré le phénotype | Adaptation mesurée, comptes de ressources et gain causal |
| Exploratory | Capacités et outils vérifiés avant déploiement | Exploration effectivement réalisée et respect de toutes les contraintes d'interface |

La composition et prévalidation des douze variants passent les tests de profils.
Cela ne représente pas douze campagnes de modèles ni 48 missions corrigées.

## Protocole et validation

Les opérations contrôlées utilisent de vraies bases SQLite, des fichiers locaux,
des jonctions Windows, un vrai processus enfant Node et le CLI Rust installé.
Les bases et sorties générées restent locales et ignorées par Git.

```powershell
node backend/tests/test_trinity_l2_identity.js
node backend/tests/test_trinity_l2_capsules.js
node backend/tests/test_trinity_l2_profiles.js
node backend/tests/test_trinity_l2_runtime.js
node backend/tests/test_trinity_l2_integration.js
$env:GENOS_L2_NATIVE_BIN = (Resolve-Path 'target/debug/genos.exe').Path
npm --prefix backend run test:trinity
python scripts/ci/check_code_quality.py
npm test
# Réutiliser le cache sur D si C manque d'espace.
cargo test --workspace --offline
```

| Contrôle | Résultat constaté |
| --- | --- |
| Identité L2 | 15 scénarios SQLite PASS, dont caller réel, reprise, tenants nuls et diagnostic après rollback |
| Capsules L2 | PASS : contenu, descripteur, ancre SQLite, concurrence, reprise, fallback explicite, jonctions et snapshots |
| Bootstrap Rust natif | PASS avec `GENOS_L2_NATIVE_BIN` ; aucun fallback dans ce cas ; résultat réellement persisté dans le root isolé |
| Profils L2 | PASS : douze variants, fiction/architecture, Factorial 16 cellules, aliases, capacités, leases par monde, native inputs et phénotype |
| Lanceur L2 | PASS : vrai processus Node, PID/répertoire observés, hashes vérifiés, replay identique et altération refusée |
| Intégration L2 | PASS : capsule/run/monde/manifest liés, seal recalculé refusé, prélaunch Factorial refusé sans aucun monde créé |
| Suite Trinity | 36 fichiers PASS sur 36, avec la voie Rust native activée |
| Régressions spécialisées | Reçus biologiques, reprise inter-processus, délégation, native runners, contrats, phénotype et snapshots PASS |
| Qualité stricte L2 | 36 fichiers source contrôlés, zéro violation |
| Qualité globale | Exit 1 : 5 254 fichiers, 297 violations dont 153 nouvelles vis-à-vis de la baseline, hors fichiers L2 contrôlés |
| Rust workspace | Exit 0 ; tests exécutés avec `CARGO_TARGET_DIR` sur D |
| `npm test` | Exit 0 après ajout de `libsodium-wrappers` 0.8.4 dans le dossier de test isolé ; suites biologie/backend, autorité, AEIS, Syncytium, Axolotl, Biome, daemon, capsules, OTEL, workers et garage exécutées |
| Index des ADR | 418 fichiers, 418 entrées, zéro problème |

Un premier passage Trinity a rendu 35/36 : le test de phénotype n'avait pas attaché
de phénotype. Les relances isolées ont passé ; la cause exacte n'est pas établie.
La fixture et ses préconditions ont été renforcées (besoins enregistrés, trois
objets et instructions non vides), puis la suite complète a passé. Ce symptôme
n'est pas interprété comme preuve d'absence de course.

Le test garage de preuves a également journalisé un poll de Signal Plane sur une
base déjà fermée (`SQLITE_MISUSE`). Le contrôle a terminé avec exit 0 ; la cause de
ce message de teardown n'est pas établie. Il est conservé comme observation pour
la revue de quiescence de L3, et ne qualifie aucune panne des missions historiques.

Le dossier local `.genos-agent-worlds/trinity-l2-20261006/` contient les logs de
validation, le rapport strict et `validation.json` avec les empreintes des 36
fichiers source. L'empreinte de ce fichier de preuves JSON est
`704f77911972bded62c2d340f1f059a49214362ace5f28585fd5b35f1c968924`.
La dépendance manquante a été récupérée à la
version **0.8.4 épinglée dans le lockfile**, sous `test-deps`, sans modifier les
manifestes du dépôt. `NODE_PATH` est positionné uniquement pour les tests.

## Limites et suite

Le classificateur technique repose sur des signaux lexicaux ; il ne prouve pas
l'adéquation scientifique de chaque profil. Les recettes restent des stratégies
demandées, non une observation des pensées privées. Les modèles configurés ne
prouvent ni disponibilité d'un serveur ni exécution d'une inférence donnée.

Les contrôles filesystem refusent les liens observables mais ne rendent pas
atomiques toutes les vérifications face à un adversaire concurrent. Hors DB, un
sceau exige une empreinte conservée extérieurement. Les ruptures entre création
du run, capsule et lancement doivent encore être clôturées selon le protocole L3.
Les diagnostics ne transforment aucune de ces ruptures en réussite.

L3 reste consacré aux comptes de ressources, aux budgets et à la clôture unique.
L4/L5 traiteront preuves indépendantes, comparaison et promotion. Les composants
et les 48 missions restent à vérifier dans les lots suivants.

Les mémoires GenOS ont été consultées ; hypothèses et expériences sont persistées.
Aucun chemin de genome/snapshot de hook de session n'a été fourni. Le checkpoint
et son enforcement restent non vérifiés ; les tests locaux ne les remplacent pas.
