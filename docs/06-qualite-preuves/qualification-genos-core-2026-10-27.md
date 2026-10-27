# Qualification du GenOS Core — 2026-10-27

- **Statut du document** : inventaire probant daté ; ce n'est pas une certification bêta.
- **Objet** : évaluer si le noyau "GenOS Core" (missions supervisées, isolation, snapshots, reprise, reçus et vérification) remplit les critères préenregistrés pour une candidature bêta, tel que proposé par l'audit de maturité du 27 octobre 2026.
- **Méthode** : séparation des preuves documentées dans le dépôt des affirmations non encore démontrées. Aucun succès n'est prétendu sans preuve citée.

## 1. Périmètre du GenOS Core

Le Core désigne le sous-ensemble cohérent et réellement qualifié de GenOS V3, distinct des capacités expérimentales (huit topologies avancées, morphogenèse, ontogenèse longitudinale, SHEV, GVX, autonomie durable).

**Inclus dans le périmètre Core :**

| Élément | Rôle dans le Core |
|---|---|
| Orchestration de mission | création, exécution supervisée, statut persistant, reçu d'exécution |
| Isolation | tenant, workspace, scope organisation/projet, refus hors autorité |
| Snapshots et replay | capture d'état durable, rejet des instantanés altérés, replay vérifiable |
| Reçus et vérification | reçus d'évidence, barrières de promotion, refus sans preuve, HMAC |
| Sécurité fail-closed | MCP sous lease, circuit breaker, refus d'outils sans bail, sandbox VFS |
| Observabilité de base | health endpoints, télémétrie, logs d'exécution |
| Build et tests | `cargo build --workspace`, suites Node obligatoires, gate qualité |

**Exclus du périmètre Core (restent en alpha avancée / recherche) :**

- les sept topologies partielles (A-Team, Trinity, Biome, Biocénose, Holobionte, Syncytium, Métapopulation) et les 20 organisations dynamiques ;
- la morphogenèse, l'ontogenèse, l'autonomie longitudinale, SHEV, GVX, AGOW ;
- les campagnes E2E utilisateurs extérieurs et la qualification C4/C5.

## 2. Critères d'acceptation préenregistrés

Ces critères sont ceux proposés par l'audit du 27 octobre 2026 pour déclarer le Core candidat bêta. Ils sont préenregistrés avant tout nouveau test.

| Critère | Énoncé |
|---|---|
| **C1** | Installation reproductible sur Windows et Linux (Docker inclus) |
| **C2** | Tous les tests obligatoires verts sur une révision figée |
| **C3** | Aucune vulnérabilité critique connue non maîtrisée |
| **C4** | Reprise après panne réelle démontrée |
| **C5** | Campagnes E2E réalisées par des utilisateurs extérieurs |

## 3. État des preuves par critère

### C1 — Installation reproductible sur Windows et Linux

**Statut : partiel.**

**Preuves disponibles (Windows) :**
- `docs/06-qualite-preuves/studio-qualification.md` (2026-10-07) : plateforme Windows x86_64, Node.js 24.18, Rust 1.97.1, Edge piloté par Playwright headless ; huit lots qualifiés sur win32 ; écriture multiprocessus (deux serveurs, une version, HTTP 200 + 409, seul contenu gagnant persisté) ; restart natif Windows (PID et instance changés, opération persistée et privée au tenant).
- `plans/plan-demonstration-incrementale.md` : Phase 0 vérifiée sur ce dépôt (`cargo build --workspace`, `npm test`, `/healthz` répond 200).

**Écarts documentés :**
- Linux/Docker n'a pas été qualifié (`studio-qualification.md`, écarts non masqués) : WSL Ubuntu 24.04 disponible mais sans Node.js ; client Docker installé mais daemon inaccessible ; aucun environnement installé ou démarré implicitement.
- Sur Windows, `cargo test --workspace` échoue (dépendance `aws-lc-sys v0.45.0`, NASM manquant, échec vérification C sous MSVC). Le plan d'incrémentation en acte : `cargo build --workspace` et les suites Node sont les cibles réalistes ; `cargo test --workspace` n'est pas un gate obligatoire sur cet environnement.
- Le Dockerfile/image `node:22-bookworm-slim` est documenté comme cible (`contrat-produit-et-completude.md`, section 5), mais aucune preuve de build propre, migration, health/readiness, scénario API+gRPC et redémarrage avec persistance sur Linux n'est citée dans les documents examinés.

**Résultat d'exécution réel — 2026-10-27 :** `cargo build --workspace` ✅ PASS sur Windows ; `npm ci` et `npm ci --prefix backend` ✅ PASS ; `cargo test --workspace` ⚪ non exécuté (bloqué Windows, voir C2). Le backend ne démarre pas sur le HEAD actuel (erreur `GVX_LEDGER_CHAIN_INVALID`, voir C2), donc le health probe Windows n'est pas obtenable par ce chemin.

**Verdict C1 :** Windows partiellement démontré (build et dépendances OK, mais backend non démarrable sur HEAD actuel) ; Linux non démontré.

### C2 — Tous les tests obligatoires verts sur une révision figée

**Statut : rouge (porte globale en échec).**

**Résultats d'exécution réels — 2026-10-27, HEAD `d55429282` (branche `v3`, Windows x86_64, Node 24.18.0, Rust 1.97.1) :**

| Commande | Résultat | Détail |
|---|---|---|
| `python scripts/ci/check_code_quality.py` | ❌ ÉCHEC | 7 688 fichiers vérifiés, 176 violations (173 nouvelles), code de sortie 1. COMPLEXITY > 10 et PARAMETERS > 3 sur de nombreux fichiers backend. |
| `npm test` (racine) | ⚠️ PARTIEL | Timeout à 5 min sur la suite `test:workers`. Suites déjà vertes avant l'arrêt : biology (8/8), worker-workspaces, identity (dossier + runtime + v2), backend (57/57), snapshots (GQWF + topologies), authority, aeis (42 suites), syncytium (51 suites), axolotl (8/8), biome (27 programmes), daemon (43/43), capsules, otel. |
| `npm --prefix backend run test:validation` | ❌ ÉCHEC | Profil `all` échoue sur `test_cryptophasia.js` : `GVX_LEDGER_CHAIN_INVALID` (`control-plane-mac-mismatch`) dans `backend/src/db/migrations/migrateGvxLedger.js:82`. Code de sortie 1. |
| `npm --prefix backend run test:mcp` | ✅ PASS | 9 suites en ~20 s. |
| `npm --prefix backend run test:grpc` | ✅ PASS | 41/41 microservices gRPC vérifiés (Ping + métiers). |
| `npm --prefix backend run test:quality` | ✅ PASS | 12 tests qualité (graders, checkpoints, provenance, normalisation, No-Answer). |
| `cargo build --workspace` | ✅ PASS | Terminé en 2m 19s (warnings uniquement, aucune erreur). |
| `cargo test --workspace` | ⚪ NON TESTÉ | Non exécuté sur cet environnement Windows : dépendance `aws-lc-sys v0.45.0` (NASM mannant + échec vérification C sous MSVC), identifié comme bloquant dans `plans/plan-demonstration-incrementale.md`. |
| `curl http://localhost:4000/healthz` | ❌ IMPOSSIBLE | Le backend ne démarre pas : boucle fatale `GVX_LEDGER_CHAIN_INVALID` au boot (même erreur que `test_cryptophasia.js`). Aucun processus n'écoute sur le port 4000. |

**Preuves documentées antérieures :**
- `docs/06-qualite-preuves/validation-produit-complet-2026-10-01.md` (révision `f17000e8`) : `npm test` 55 assertions passées ; `test:validation` 106 suites passées ; `cargo test --workspace` tous verts ; MAIS `check_code_quality.py` échoue sur 359 violations (143 au-delà du baseline).
- `docs/06-qualite-preuves/studio-qualification.md` (2026-10-07) : `npm test`, `cargo test --workspace`, `test:studio`, `test:mcp`, `test:grpc`, `test:quality` verts sur Windows ; MAIS `test:validation` étendu échoue (`test_biological_benchmark_runner.js:31`, `test_dynamic_organization.js:109`).

**Verdict C2 :** non rempli. Porte qualité en échec (176 violations), suite de validation en échec sur le HEAD actuel (`GVX_LEDGER_CHAIN_INVALID`), et le backend ne peut pas démarrer (pas de health probe). Le HEAD actuel (`d55429282`, mon propre commit de documentation) ne résout pas ces blocages.

### C3 — Aucune vulnérabilité critique connue non maîtrisée

**Statut : partiel / non confirmé.**

**Preuves disponibles :**
- `docs/05-securite-gouvernance/verification-correctifs-codeql-2026-10-15.md` : 12 alertes CodeQL sur `.github/workflows/backend-ci.yml`, `backend-validation.yml` et `validation.yml` ; workflows restaurés et poussés sur `v3` (commits `930b2e4f` et suivants) avec `permissions: contents: read` au niveau global. Aucun job ne publie de contenu ni ne modifie le dépôt.
- `docs/05-securite-gouvernance/remediation-securite-immunitaire.md` : correctifs SSRF, injection SQL, permissions documentés ; deux scanners (CodeQL/Semgrep) signalent des injections SQL sur des fichiers.
- `docs/03-reference/contrat-produit-et-completude.md` : VFS_SANDBOX partiel, IMMUNE_SYSTEM partiel, OUTPUT_GOVERNOR partiel, GOVERNANCE_APPROVAL partiel, MCP backend dispatch implémenté.

**Écarts documentés :**
- `verification-correctifs-codeql-2026-10-15.md` : « Cette note consigne les preuves disponibles pour les alertes listées dans l’objectif CodeQL. Elle ne vaut pas fermeture des alertes dans GitHub. » Aucun accès à l'API des alertes CodeQL ; le dernier scan ne peut pas confirmer leur fermeture.
- `remediation-securite-immunitaire.md` : des alertes restent présentes ; la validation de sécurité globale n'est pas confirmée après corrections.

**Résultat d'exécution réel — 2026-10-27 :** aucun scan de sécurité n'a été réexécuté lors de cette qualification. Le backend ne peut pas démarrer sur le HEAD actuel, donc aucun test de sécurité runtime n'a pu être mené.

**Verdict C3 :** correctifs documentés (CodeQL 15 octobre, SSRF/injection/permissions), mais fermeture des alertes GitHub et validation de sécurité complète non confirmées.

### C4 — Reprise après panne réelle démontrée

**Statut : partiel (simulé, pas de panne OS réelle).**

**Preuves disponibles :**
- `docs/06-qualite-preuves/matrice-qualification-stewardship-v3-2026-10-20.md`, section 4.3 : scénarios testant interruption, rejeu idempotent, expiration de lease, ordre des checkpoints. Résistance à une panne OS brutale avec processus réels reste à qualifier séparément.
- `docs/06-qualite-preuves/tests-et-validation.md`, section 15 : `test_worker_failure_recovery.js` (mutate_worker, fork_worker, replace_worker, escalate_unresolved, `no_answer` sans preuve) ; `test_automatic_bisection_recovery.js` (timeline de snapshots, régression isolée, recherche dichotomique bornée). Ces tests ne font pas tomber volontairement une machine, ne redémarrent pas un cluster et ne prouvent pas la récupération après coupure d'alimentation ou corruption de disque.
- `studio-qualification.md` : brouillon survit à un conflit et à une perte réseau simulée ; une modification pendant la réponse de sauvegarde reste identifiée comme non enregistrée.

**Écarts documentés :**
- Pas de suite de chaos engineering dédiée (`tests-et-validation.md`, section 10.2) : aucune injection systématique de pannes de réseau, disque, processus, DNS, clock skew ou partition inter-services.
- Pas de preuve de reprise après panne OS réelle avec processus workers réels.

**Résultat d'exécution réel — 2026-10-27 :** aucun test de reprise après panne réelle n'a été exécuté. Les tests de recovery existent dans le dépôt (`test:recovery` : worker failure recovery, bisection causale, reconnexions de boucle d'exécution) mais n'ont pas été lancés dans le cadre de cette qualification. Le backend ne démarrant pas, aucun test de reprise runtime n'est obtenable.

**Verdict C4 :** reprise simulée et idempotence testées (dans le code, non exécutées ici) ; panne réelle non démontrée.

### C5 — Campagnes E2E réalisées par des utilisateurs extérieurs

**Statut : rouge (absent).**

**Preuves disponibles :**
- Aucune campagne E2E par des utilisateurs extérieurs n'est rapportée dans les documents examinés.
- `docs/06-qualite-preuves/matrice-qualification-stewardship-v3-2026-10-20.md`, synthèse : « effet longitudinal public : absent — aucune campagne réelle publiée dans le dépôt ».
- `contrat-produit-et-completude.md` : qualification globale toujours ouverte pour plusieurs capacités ; références « à publier / à référencer » sont des écarts de preuve ouverts, pas des réussites présumées.

**Verdict C5 :** non rempli — aucune campagne E2E utilisateurs extérieurs dans le dépôt, aucune exécutée dans le cadre de cette qualification.

## 4. Écarts bloquants pour la bêta Core (constatés par exécution)

1. **CI complète non verte sur le HEAD actuel `d55429282`** :
   - `check_code_quality.py` : ❌ 176 violations (173 nouvelles), code de sortie 1.
   - `test:validation` (profil `all`) : ❌ échoue sur `test_cryptophasia.js` (`GVX_LEDGER_CHAIN_INVALID`, migration ledger GVX), code de sortie 1.
   - Le backend ne démarre pas : boucle fatale `GVX_LEDGER_CHAIN_INVALID` au boot, aucun processus n'écoute sur le port 4000, health check `/healthz` impossible.
2. **Linux/Docker non qualifié** : aucune preuve d'installation propre, build, migration, health/readiness et reprise sur l'image `node:22-bookworm-slim`.
3. **Sécurité non certifiée** : alertes CodeQL non confirmées fermées sur GitHub ; aucune validation de sécurité complète post-corrections.
4. **Aucune campagne E2E extérieure** : C5 totalement absent.
5. **Panne réelle non démontrée** : C4 limité à des simulations et des tests d'idempotence présents dans le code (non exécutés).

## 5. Verdict de qualification

**Le GenOS Core n'est pas qualifié pour une bêta publique à ce jour (2026-10-27).**

Deux des cinq critères d'acceptation sont en échec avéré par exécution (C2), un est impossible à vérifier car le backend ne démarre pas (C1 health probe, C4), un est documenté non confirmé (C3), et un est totalement absent (C5).

Seuls trois critères partiels sont positifs par exécution : `test:mcp` ✅, `test:grpc` ✅, `cargo build --workspace` ✅, `test:quality` ✅.

**Positionnement honnête recommandé :**

> GenOS Core — alpha avancée, non qualifié bêta. Noyau avec composants opérationnels et tests d'intégration sur Windows (MCP, gRPC, build Rust verts) ; mais CI complète en échec (porte qualité + suite de validation), backend non démarrable sur le HEAD actuel (erreur de migration ledger GVX), installation Linux non démontrée, sécurité non certifiée, reprise après panne réelle non démontrée, et aucune campagne E2E externe. Tous ces écarts doivent être comblés avant tout passage en bêta.

## 6. Synthèse des résultats d'exécution (2026-10-27)

| Commande | Résultat | Code de sortie | Preuve |
|---|---|---|---|
| `python scripts/ci/check_code_quality.py` | ❌ ÉCHEC | 1 | 176 violations (173 nouvelles) |
| `npm test` (racine) | ⚠️ PARTIEL | timeout 5 min | Suites biology, backend (57/57), snapshots, authority, aeis, syncytium, axolotl, biome, daemon (43/43), capsules, otel vertes avant arrêt sur `test:workers` |
| `npm --prefix backend run test:validation` | ❌ ÉCHEC | 1 | `test_cryptophasia.js` : `GVX_LEDGER_CHAIN_INVALID` (migration ledger GVX) |
| `npm --prefix backend run test:mcp` | ✅ PASS | 0 | 9 suites, ~20 s |
| `npm --prefix backend run test:grpc` | ✅ PASS | 0 | 41/41 microservices gRPC |
| `npm --prefix backend run test:quality` | ✅ PASS | 0 | 12 tests qualité |
| `cargo build --workspace` | ✅ PASS | 0 | 2m 19s, warnings uniquement |
| `cargo test --workspace` | ⚪ NON TESTÉ | — | Bloqué Windows (`aws-lc-sys`/NASM/MSVC) |
| `curl http://localhost:4000/healthz` | ❌ IMPOSSIBLE | — | Backend ne démarre pas (`GVX_LEDGER_CHAIN_INVALID` en boucle) |
| Installation Linux/Docker | ⚪ NON TESTÉ | — | Aucune preuve dans le dépôt |
| Campagnes E2E externes | ⚪ ABSENT | — | Aucun rapport dans le dépôt |
| Reprise après panne réelle | ⚪ NON TESTÉ | — | Tests de recovery présents, non exécutés |

**Total : 4 ✅ / 2 ❌ / 6 ⚪ ou ⚠️**

## 7. Conditions à remplir avant déclaration Core Beta

- [ ] C1 : build propre et tests Node sur Linux/Docker (`node:22-bookworm-slim`), health/readiness, scénario API+gRPC, redémarrage avec persistance ; reproductibilité Windows confirmée incluant `cargo build --workspace`.
- [ ] C2 : `npm test`, `npm --prefix backend run test:validation` (profil `all`), `python scripts/ci/check_code_quality.py` (pas de nouvelle violation au-delà du baseline), `cargo test --workspace` sur les plateformes cibles, sur une révision figée.
- [ ] C3 : fermeture confirmée des alertes CodeQL via l'API GitHub ; validation de sécurité complète après corrections (SSRF, injection, permissions).
- [ ] C4 : campagne de reprise après panne réelle (kill OS du worker, coupure courant/disque, corruption SQLite) avec reprise déterministe, aucune double écriture, artefacts conservés.
- [ ] C5 : au moins une campagne E2E menée par des utilisateurs extérieurs, avec protocole, version, environnement et résultats publiés.

## 7. Commandes de vérification locale (référence)

```powershell
# Gate qualité
python scripts/ci/check_code_quality.py

# Suites Node obligatoires
npm test
npm --prefix backend run test:validation
npm --prefix backend run test:mcp
npm --prefix backend run test:grpc
npm --prefix backend run test:quality

# Build Rust (cible réaliste sur Windows ; test hors Windows si toolchain complète)
cargo build --workspace
cargo test --workspace

# Health
curl http://localhost:4000/healthz   # après `npm --prefix backend start`
```

## Références

- [Audit de maturité GenOS V3, 27 octobre 2026] — positionnement proposé : Core bêta candidate, Research alpha avancée, Autonomous recherche.
- [Contrat produit et définition de « terminé »](../03-reference/contrat-produit-et-completude.md) — revue 2026-10-06, statuts des topologies et capacités transverses.
- [Studio — qualification du 2026-10-07](studio-qualification.md) — preuves Windows, écarts non masqués.
- [Validation complète du produit — 2026-10-01](validation-produit-complet-2026-10-01.md) — révision `f17000e8`, porte qualité en échec.
- [Matrice de qualification — stewardship V3 — 2026-10-20](matrice-qualification-stewardship-v3-2026-10-20.md) — niveaux C0–C5, boucle intégrée C3 local, effet longitudinal public absent.
- [Vérification des correctifs CodeQL, 15 octobre 2026](../05-securite-gouvernance/verification-correctifs-codeql-2026-10-15.md) — non-fermeture des alertes GitHub.
- [Plan de démonstration incrémentale](../plans/plan-demonstration-incrementale.md) — limites connues Windows, phases 0 à 7.
