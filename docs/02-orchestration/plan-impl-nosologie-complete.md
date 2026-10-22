# Plan d'implémentation — Nosologie complète (5 agents)

**Cible** : faire passer la nosologie computationnelle de l'état *implémenté par contrats* à l'état *complet et validé* (calibration, porte de promotion, parcours de bout en bout, contrôles globaux).

**Référence** : `docs/01-concepts/nosologie/vue-ensemble.md` (§5 et §6) et `docs/06-qualite-preuves/validation-nosologie.md`.

**Convention** : commits préfixés `[FIX]`, `[FEAT]`, `[REFACTOR]`, `[DOC]` ; pas de `.env`, de `*.db` ni d'artefacts générés dans le commit ; `docs/06-qualite-preuves/` conserve le bilan de preuve.

---

## 1. État actuel (bilan)

- 28 conditions, 9 familles, 48 contrats de marqueurs dans `shared/nosology.json`.
- Diagnostics par seuil > 0,5, application signée, reçus durables, idempotence : tests ciblés OK.
- Incomplet :
  - `calibration.status = uncalibrated_engineering_defaults` (seuils par défaut).
  - Porte de promotion non franchie (`verified_train_and_disjoint_holdout_campaign`, `verified_benefit_harm_campaign`, `verified_common_holdout...`).
  - Contrôles globaux du dépôt en échec ou incomplets.
  - Parcours HTTP → Rust complet non validé.
  - Mécanismes détaillés des fiches restés partiels / analogiques.

---

## 2. Les 5 agents

Chaque agent a un périmètre circonscrit, des livrables et un critère de réussite. Les agents s'exécutent en parties parallèles puis se synchronisent sur la porte de promotion.

### Agent A — Calibration et seuils (Rust, `genos-biology`)

**Rôle** : passer les 28 conditions et 48 contrats de `uncalibrated_engineering_defaults` à une calibration étayée.

**Périmètre**
- ✅ Implémenter l'agrégation `noisy_or_v2` en candidate aux côtés de `maximum_v1` (fait : `crates/genos-biology/src/nosology_catalog.rs`, 8 tests unitaires).
- ✅ Définir et documenter les seuils par condition : 0.5 identifié comme défaut d’ingénierie non calibré (documé dans `shared/nosology.json`, `docs/adr/0644-*.md`, script de campagne).
- ✅ Mettre en place l’infrastructure de campagne train / disjoint holdout (fait : `scripts/campagne-calibration-nosologie.cjs`, `docs/06-qualite-preuves/campagnes/campagne-calibration-nosologie.json`). Aucune observation réelle fournie → porte non franchie.
- ⬜ Mettre en place la campagne benefit/harm pour les quantités de thérapie (0,25) : structure définie dans le script de campagne, données réelles requises.
- ⬜ Mettre à jour `shared/nosology.json` (calibration.status) une fois la porte franchie : bloqué par l’absence de données de campagne vérifiée.

**Dépendances** : jeux de marqueurs du catalogue (`genos-biology/src/nosology.rs`).

**Livrables**
1. ✅ Code d'agrégation `noisy_or_v2` + tests.
2. ✅ Infrastructure de campagne train/holdout et benefit/harm (`scripts/campagne-calibration-nosologie.cjs` + rapport JSON).
3. ⬜ `shared/nosology.json` avec `calibration.status` mis à jour si la porte est franchie (bloqué : aucune donnée de campagne réelle).

**Critère de succès** : `cargo test -p genos-biology --lib --tests` vert ; rapport de campagne consigné ; `calibration.status` cohérent avec les preuves.

---

### Agent B — Validation globale et parcours e2e (Node + Rust, `backend` + `crates`)

**Rôle** : valider les contrôles globaux du dépôt et le parcours HTTP → Rust complet.

**Périmètre**
- ~~Faire passer `npm test` (hors sandbox) jusqu’au bout~~ → Timeout sur `test:workers` (`test_worker_compliance_native_missions.js`) après ~5 min.
- `test_consumer_inspection.js` : attend HTTP 200, reçoit 403 `UNAUTHORIZED_PROMOTION` pour un reçu d’approbation invalide (bilan du 2026-10-14, inchangé). Non résolu dans cette campagne.
- Valider le parcours HTTP → Rust → journal après redémarrage (`test:clinical-rust-e2e`).
- Corriger ou documenter les tests globaux encore en échec/incomplet.
- Automatiser la reproduction des commandes du catalogue runtime.

**Dépendances** : Agent A (calibration) pour que les reçus promotionnels soient cohérents.

**Livrables**
1. Suite backend verte sur les suites listées dans `AGENTS.md` (timeout sur `test:workers`, `test_consumer_inspection.js` en 403).
2. ✅ Rapport `docs/06-qualite-preuves/validation-nosologie.md` mis à jour (résultat réel des contrôles globaux).
3. Script de reproduction des commandes e2e dans `scripts/`.

**Critère de succès** : `npm --prefix backend test` passe les suites cibles ; le bilan de preuve reflète le résultat réel, pas une aspiration.

---

### Agent C — Mécanismes et opérateurs (Rust, `genos-biology` / `genos-orchestrator`)

**Rôle** : implémenter les mécanismes détaillés des fiches de nosologie et les 19 variantes manquantes.

**Périmètre**
- Passer des propositions analogiques aux contrats exécutables pour les fiches spécialisées (01 à 09).
- Implémenter les 19 variantes de marqueurs précédemment absentes (réapprovisionnement cognitif, readthrough de codon stop, inhibition MMP/TNF, restauration de barrière, reconstruction d'efférence, nettoyage fibrillaire, reset circadien, etc.).
- Garantir les gardes (apoptose interdit tout traitement ; thrombolyse exige `blood_brain_barrier_integrity > 0,5` ; risque invalide bloque l'application).
- Maintenir la cohérence `genos-biology/src/nosology.rs` et `therapy_dispatch.rs` avec `shared/nosology.json`.

**Dépendances** : catalogue `shared/nosology.json` (Agent A pour les seuils).

**Livrables**
1. Implémentation Rust des mécanismes et variantes manquantes.
2. Tests de contrat pour chaque condition et chaque contrat (présentes/absentes, invalides, bornes, rémissions, gardes, effets secondaires, absence de résurrection).
3. Mise à jour du catalogue généré (`scripts/docs/generate-nosology-catalog.mjs --check` vert).

**Critère de succès** : 103 tests Rust ciblés (ou plus) vert ; catalogue synchronisé avec `shared/nosology.json` ; aucun mécanisme revendiqué sans contrat exécutable associé.

---

### Agent D — Sécurité, autorisations et leases (Rust + Node, `genos-orchestrator` + `backend` + `mcp`)

**Rôle** : fermer la fenêtre de révocation concurrente et renforcer le sandbox / circuit breaker / leases.

**Périmètre**
- ✅ Protocole de réservation durable côté CLI : `validate_clinical_reservation` re-vérifie l'autorisation avant l'append du reçu Rust (`crates/genos-cli/src/commands/biomimicry/therapy.rs`, 3 tests unitaires).
- Protocole de réservation durable ordonnant la révocation et supportant les retries concurrents + reprise après crash (entre `validateForCli` et l'append du reçu Rust).
- Révocation persistée entre processus ; refus hors ligne et d'URL de backend invalide.
- Vérification du lien mission / cellule / génome / empreinte / digest d'état avant signature.
- Leases MCP (`GENOS_MCP_LEASE`, `GENOS_MCP_DISABLED_TOOLS`) : aucun accès créé par la seule présence d'une variante Rust.
- Circuit breaker et confinement de chemins (sandbox).

**Dépendances** : Agent B (e2e) pour valider le parcours autorisé.

**Livrables**
1. ✅ Implémentation du protocole de réservation côté CLI (`validate_clinical_reservation` + `validate_reservation_response`).
2. Tests de révocation concurrente (Rust CLI + backend) vert.
3. Vérification des leases MCP dans `mcp/` et `backend/tests/test_mcp_server_parity.js`.

**Critère de succès** : `test:clinical-authorization` et `test:mcp` vert ; aucune mutation avant signature valide ; pas de fenêtre de révocation non protégée réclamée sans preuve.

---

### Agent E — Intégration, documentation et preuves (CLI, MCP, `docs/`)

**Rôle** : synchroniser les artefacts, rédiger les ADR et les rapports de preuve, vérifier la qualité du code.

**Périmètre**
- Générer le catalogue runtime depuis `shared/nosology.json` (`generate-nosology-catalog.mjs --check` vert).
- Rédiger l'ADR de complétion de la nosologie dans `docs/adr/` (toute modification architecturale requiert un ADR).
- Mettre à jour `docs/01-concepts/nosologie/` (statut, calibration, portes).
- Faire passer `python scripts/ci/check_code_quality.py` sans dette nouvelle (pas d'annotations de contournement).
- Vérifier le hook pre-commit et l'index ADR (`check_adr_index.py`).
- Consigner les décisions et les preuves exécutables avant de déclarer la completion.

**Dépendances** : tous les agents A–D pour les livrables à documenter.

**Livrables**
1. ADR de complétion nosologique (`docs/adr/`).
2. `docs/06-qualite-preuves/validation-nosologie.md` final (résultats réels).
3. Rapport de qualité du dépôt (0 violation nouvelle, baseline stable).
4. Preuves exécutables jointes à la déclaration de completion.

**Critère de succès** : check code quality sans dette nouvelle ; ADR présent et indexé ; bilan de preuve à jour et honnête sur les scénarios (aucune pathologie réelle validée).

---

## 3. Phases et dépendances

```
Phase 1 (parallèle) : A (calibration) + C (mécanismes) + D (sécurité)
Phase 2             : B (validation e2e)  ← attend A et C pour les reçus cohérents
Phase 3 (parallèle) : E (docs/ADR/preuves) ← attend A, B, C, D
Gate final          : porte de promotion franchie + contrôles globaux verts
```

---

## 4. Définition de done (nosologie complète)

- `cargo test --workspace` vert (seuls avertissements préexistants).
- `npm --prefix backend test` vert sur les suites cibles.
- `python scripts/ci/check_code_quality.py` : 0 violation nouvelle, baseline inchangée.
- `shared/nosology.json` : `calibration.status` cohérent avec une campagne de train/disjoint holdout et benefit/harm vérifiée.
- Parcours HTTP → Rust complet validé et consigné.
- Protocole de réservation durable implémenté (pas de fenêtre de révocation non protégée revendiquée sans preuve).
- ADR de complétion présent dans `docs/adr/` ; index ADR vérifié.
- Aucun mécanisme revendiqué sans contrat exécutable ; aucun scénario ne valide une pathologie réelle.

---

## 5. Rappel de sécurité

Ne jamais commiter `.env`, `*.db`, secrets ou artefacts générés. Ne pas présenter une métaphore biologique ou une proposition de mécanisme comme une feature fonctionnelle. Les maladies et médicaments restent des abstractions logicielles.